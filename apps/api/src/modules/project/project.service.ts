import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
    PayloadTooLargeException,
    UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Project } from 'src/entities/project.entity';
import { ProjectVersion } from 'src/entities/project-version.entity';
import { ProjectFile } from 'src/entities/project-file.entity';
import { ProjectLink } from 'src/entities/project-link.entity';
import { Child } from 'src/entities/child.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Role } from 'src/enum/role.enum';
import { ProjectSource } from 'src/enum/project-source.enum';
import { ProjectStatus } from 'src/enum/project-status.enum';
import { S3Service } from 'src/modules/storage/s3.service';
import { parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { hashContent, ingestionKey, projectFileKey, projectThumbnailKey } from './project.keys';
import { inspectFile, isVideoName, MAX_VIDEO_BYTES, sizeLimitFor } from './file-types';
import { daysWaiting, STALE_PENDING_DAYS } from './pending.rules';
import { ThumbnailService } from './thumbnail.service';
import { CreateProjectDto } from './dto/createProject.dto';
import { FilterProjectDto } from './dto/filterProject.dto';
import { IngestProjectDto } from './dto/ingestProject.dto';
import { ReassignProjectDto } from './dto/reassignProject.dto';
import { RegisterLargeFileDto } from './dto/registerLargeFile.dto';

/** What multer hands over. Declared here so the module does not depend on `Express.Multer` typings at call sites. */
export interface UploadedFile {
    originalname: string;
    buffer: Buffer;
    size: number;
}

/** The relations a project needs to be answerable: whose it is, and what is in it. */
const PROJECT_RELATIONS = ['child', 'child.parent', 'child.parent.user', 'child.group', 'versions', 'versions.files', 'links'];

/** What is waiting to be sent, for the whole school and per group — E17/S8. */
export interface PendingSummary {
    /** Every document in `new`, including any whose child is in no group. */
    total: number;
    /** Whole days the oldest of them has waited. Null when nothing is waiting. */
    oldestDays: number | null;
    /** The line the screen draws between "a queue" and "a lapse" — a proposal, shown as one. */
    staleAfterDays: number;
    /** Oldest-first: the group that has been waiting longest is the one to open. */
    byGroup: { groupId: number; count: number; oldestDays: number }[];
}

@Injectable()
export class ProjectService {
    private readonly logger = new Logger('Projects');

    constructor(
        @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
        @InjectRepository(ProjectFile) private readonly fileRepository: Repository<ProjectFile>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        private readonly s3Service: S3Service,
        private readonly thumbnailService: ThumbnailService,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * One file, straight from the watched folder. E14/S2.
     *
     * **Idempotent on content.** The key is `{childId}:{sha256}` and it is unique in the database, so
     * a retry after a dropped network — which is the normal way an agent behaves, not an edge case —
     * finds the existing project and returns it rather than producing a second one. Without that, a
     * retry would mean two projects and, at send time, the same thumbnail twice in a parent's email.
     *
     * The hash is recomputed here even when the agent sends one. The agent's value is a claim about
     * bytes we are holding, and taking it on trust would let a mistaken client collide with — or
     * silently swallow — somebody else's upload.
     */
    async ingestFile(dto: IngestProjectDto, upload: UploadedFile, userId: number): Promise<Project> {
        const verdict = inspectFile(upload.originalname, upload.buffer);
        if (!verdict.ok) {
            throw rejection(verdict.reason, upload.originalname);
        }
        // Video has a ceiling of its own and a road of its own: it is registered first and uploaded
        // straight to S3. Arriving here means it came through the process, which is the thing the
        // signed-URL road exists to prevent.
        if (verdict.isVideo) {
            throw new BadRequestException({
                message: 'Video is uploaded straight to storage; register it first and use the signed URL.',
                error: 'PROJECT_FILE_NEEDS_DIRECT_UPLOAD',
            });
        }

        const contentHash = hashContent(upload.buffer);
        if (dto.contentHash && dto.contentHash !== contentHash) {
            throw new BadRequestException({ message: 'The file does not match the hash that was sent with it.', error: 'PROJECT_CONTENT_HASH_MISMATCH' });
        }

        const child = await this.requireChild(dto.childId);
        const key = ingestionKey(child.id, contentHash);

        // Fast path: this exact file, for this exact child, is already here. Answering from outside
        // the transaction keeps the common retry cheap.
        const existing = await this.findByIngestionKey(key);
        if (existing) return existing;

        const classSession = await this.findSessionFor(child, dto.capturedOn);

        const projectId = await this.dataSource
            .transaction(async (manager) => {
                const project = dto.projectId
                    ? await this.loadProjectForVersioning(manager, dto.projectId, child.id)
                    : await manager.save(
                          manager.create(Project, {
                              child,
                              classSession,
                              title: dto.title?.trim() || titleFromFileName(upload.originalname),
                              description: dto.description ?? null,
                              capturedOn: parseIsoDate(dto.capturedOn),
                              status: ProjectStatus.NEW,
                              source: ProjectSource.AGENT,
                              uploadedBy: { id: userId } as never,
                          }),
                      );

                const version = await manager.save(
                    manager.create(ProjectVersion, {
                        project,
                        versionNumber: await nextVersionNumber(manager, project.id),
                    }),
                );

                // `orIgnore` rather than a catch: a unique violation inside a transaction aborts the
                // whole transaction, so the collision has to be refused by the statement rather than
                // raised by it. An empty result means another pass won the race a millisecond ago.
                const inserted = await manager
                    .createQueryBuilder()
                    .insert()
                    .into(ProjectFile)
                    .values({
                        version,
                        originalName: upload.originalname.slice(0, 255),
                        contentType: verdict.contentType,
                        sizeBytes: upload.buffer.length,
                        ingestionKey: key,
                        uploadedAt: new Date(),
                    })
                    .orIgnore()
                    .returning('id')
                    .execute();

                const fileId = (inserted.raw as { id: number }[])[0]?.id;
                if (fileId === undefined) {
                    throw new IngestionRaceError();
                }

                // Inside the transaction, like the invoice PDF: the key embeds the row's id, so the row
                // must exist first — and if the upload then fails, no row may survive it. E04 recorded
                // the other order failing exactly this way, with the retry wedging on a unique
                // constraint afterwards.
                await this.s3Service.putObject({
                    key: projectFileKey(project.id, version.id, fileId),
                    body: upload.buffer,
                    contentType: verdict.contentType,
                });

                return project.id;
            })
            .catch(async (error: unknown) => {
                if (error instanceof IngestionRaceError) {
                    const winner = await this.findByIngestionKey(key);
                    if (winner) return winner.id;
                }
                throw error;
            });

        // After the commit, never inside it: a thumbnail is allowed to fail, and failing inside the
        // transaction would take the upload with it. A project without a thumbnail is much better
        // than a project that did not upload.
        if (verdict.isImage) {
            await this.attachThumbnail(projectId, upload.buffer);
        }

        return this.requireProject(projectId);
    }

    /**
     * A project typed in from the group screen: links, and nothing to upload. E14/S1 and S2.
     *
     * The road exists because a Tinkercad model, a Canva design or a shared Scratch project is not a
     * file anybody saves into a folder, and those are what the youngest groups in the catalogue
     * actually produce. The agent is the main road, not the only one.
     */
    async createProject(dto: CreateProjectDto, userId: number): Promise<Project> {
        if (dto.links.length === 0) {
            throw new BadRequestException({ message: 'A project needs at least one file or one link.', error: 'PROJECT_EMPTY' });
        }

        const child = await this.requireChild(dto.childId);
        const classSession = await this.findSessionFor(child, dto.capturedOn);

        const projectId = await this.dataSource.transaction(async (manager) => {
            const project = await manager.save(
                manager.create(Project, {
                    child,
                    classSession,
                    title: dto.title,
                    description: dto.description ?? null,
                    capturedOn: parseIsoDate(dto.capturedOn),
                    status: ProjectStatus.NEW,
                    source: ProjectSource.ADMIN,
                    uploadedBy: { id: userId } as never,
                }),
            );

            await manager.save(dto.links.map((link) => manager.create(ProjectLink, { project, label: link.label, url: link.url })));

            return project.id;
        });

        return this.requireProject(projectId);
    }

    /**
     * The first half of a large upload: the row, and a URL to PUT the bytes to. E14/S2.
     *
     * Nothing about the content can be checked here, because the whole point is that it never
     * reaches this process. What can be checked is the name, the ceiling, and — afterwards, in
     * `completeUpload` — that an object of a plausible size actually turned up.
     */
    async registerLargeFile(dto: RegisterLargeFileDto, userId: number): Promise<{ projectId: number; fileId: number; uploadUrl: string }> {
        const declared = isVideoName(dto.originalName);
        if (!declared) {
            throw new UnsupportedMediaTypeException({
                message: 'Only video takes the direct-upload road; everything else is small enough to send through the API.',
                error: 'PROJECT_FILE_NOT_DIRECT_UPLOADABLE',
            });
        }
        if (dto.sizeBytes > MAX_VIDEO_BYTES) {
            throw new PayloadTooLargeException({ message: 'The file is past the size limit.', error: 'PROJECT_FILE_TOO_LARGE' });
        }

        const child = await this.requireChild(dto.childId);
        const key = ingestionKey(child.id, dto.contentHash);

        const existing = await this.findByIngestionKey(key);
        if (existing) {
            throw new ConflictException({ message: 'This file has already been uploaded for this child.', error: 'PROJECT_FILE_ALREADY_UPLOADED' });
        }

        const classSession = await this.findSessionFor(child, dto.capturedOn);

        const registered = await this.dataSource.transaction(async (manager) => {
            const project = await manager.save(
                manager.create(Project, {
                    child,
                    classSession,
                    title: dto.title?.trim() || titleFromFileName(dto.originalName),
                    capturedOn: parseIsoDate(dto.capturedOn),
                    status: ProjectStatus.NEW,
                    source: ProjectSource.AGENT,
                    uploadedBy: { id: userId } as never,
                }),
            );
            const version = await manager.save(manager.create(ProjectVersion, { project, versionNumber: 1 }));
            const file = await manager.save(
                manager.create(ProjectFile, {
                    version,
                    originalName: dto.originalName.slice(0, 255),
                    contentType: 'video/mp4',
                    sizeBytes: dto.sizeBytes,
                    ingestionKey: key,
                    // Null until the bytes are confirmed. A file in this state is not shown to a
                    // parent and does not let its project be sent.
                    uploadedAt: null,
                }),
            );
            return { projectId: project.id, versionId: version.id, fileId: file.id };
        });

        const uploadUrl = await this.s3Service.presignedUploadUrl(projectFileKey(registered.projectId, registered.versionId, registered.fileId), 'video/mp4');

        return { projectId: registered.projectId, fileId: registered.fileId, uploadUrl };
    }

    /**
     * The second half: the client says it has finished, and the bucket is asked whether that is
     * true. E14/S2.
     *
     * Asked, not believed — the row is only marked complete if an object is actually there. An
     * upload that died halfway would otherwise leave a project that looks ready and sends a parent
     * a link to nothing.
     */
    async completeUpload(fileId: number): Promise<ProjectFile> {
        const file = await this.fileRepository.findOne({ where: { id: fileId }, relations: ['version', 'version.project'] });
        if (!file) throw new NotFoundException('Project file not found');
        if (file.uploadedAt) return file;

        const head = await this.s3Service.headObject(projectFileKey(file.version.project.id, file.version.id, file.id));
        if (!head) {
            throw new ConflictException({ message: 'No object has arrived for this file yet.', error: 'PROJECT_FILE_NOT_UPLOADED' });
        }

        file.uploadedAt = new Date();
        file.sizeBytes = head.sizeBytes;
        return this.fileRepository.save(file);
    }

    /**
     * The list, narrowed by who is asking.
     *
     * An admin sees everything. **A parent sees only their own children's work, and only what has
     * been sent** — a document in `nou` is still in review, and the portal must not be the back door
     * through which a parent sees something nobody has checked yet.
     *
     * `andWhere` throughout, never `where`: a `where` after the user restriction replaces it
     * silently, which is precisely how `PaymentService.findOne` once handed every family's payments
     * to anyone who asked.
     */
    async findProjects(filters: FilterProjectDto, role: Role, userId: number): Promise<Project[]> {
        const qb = this.projectRepository
            .createQueryBuilder('project')
            .leftJoinAndSelect('project.child', 'child')
            .leftJoinAndSelect('child.parent', 'parent')
            .leftJoinAndSelect('child.group', 'group')
            .leftJoinAndSelect('project.versions', 'version')
            .leftJoinAndSelect('version.files', 'file')
            .leftJoinAndSelect('project.links', 'link');

        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId }).andWhere('project.status = :sent', { sent: ProjectStatus.SENT });
        }

        if (filters.groupId) qb.andWhere('group.id = :groupId', { groupId: filters.groupId });
        if (filters.childId) qb.andWhere('child.id = :childId', { childId: filters.childId });
        if (filters.status) qb.andWhere('project.status = :status', { status: filters.status });
        if (filters.dateFrom) qb.andWhere('project.capturedOn >= :from', { from: filters.dateFrom });
        if (filters.dateTo) qb.andWhere('project.capturedOn <= :to', { to: filters.dateTo });

        return qb.orderBy('project.capturedOn', 'DESC').addOrderBy('project.id', 'DESC').getMany();
    }

    /**
     * One project by the identifier in a parent's link. E14/S5.
     *
     * **403, not 404, when it belongs to another family** — the resource exists, and a silent refusal
     * is harder to report than an explicit one. That is the opposite of the rule the list follows,
     * and deliberately: a list narrows, because "not yours" and "not there" are the same answer to a
     * query, whereas a link that a parent was given and cannot open needs to say which of the two it
     * is.
     */
    async findByPublicId(publicId: string, role: Role, userId: number): Promise<Project> {
        const project = await this.projectRepository.findOne({ where: { publicId }, relations: PROJECT_RELATIONS });
        if (!project) throw new NotFoundException('Project not found');

        if (role !== Role.ADMIN) {
            // `?.` on `user`: a profile an admin typed in has no account attached, and without the
            // optional chain a child of such a profile throws a TypeError instead of answering 403.
            if (project.child.parent.user?.id !== userId) {
                throw new ForbiddenException({ message: "This is another family's document.", error: 'PROJECT_NOT_YOURS' });
            }
            if (project.status !== ProjectStatus.SENT) {
                // Not yet reviewed, so as far as a parent is concerned it does not exist. They have
                // no way to hold such a link — nothing is mailed before the send — so this is a
                // guard against a link that was shared sideways, not a case anyone meets.
                throw new NotFoundException('Project not found');
            }
        }

        return project;
    }

    async findOne(id: number, role: Role, userId: number): Promise<Project> {
        const project = await this.projectRepository.findOne({ where: { id }, relations: PROJECT_RELATIONS });
        if (!project) throw new NotFoundException('Project not found');
        if (role !== Role.ADMIN && project.child.parent.user?.id !== userId) {
            throw new ForbiddenException({ message: "This is another family's document.", error: 'PROJECT_NOT_YOURS' });
        }
        return project;
    }

    /**
     * A short-lived URL for one file, issued only after the child has been shown to belong to the
     * caller. E14/S5.
     *
     * The URL is signed with `Content-Disposition: attachment`, so what is stored is always saved
     * and never rendered. Files from a share that any machine in the school can write to have no
     * business being interpreted by a browser on the school's own domain, and a signed URL is the
     * one path that goes around this application's own response headers.
     */
    async fileDownloadUrl(projectId: number, fileId: number, role: Role, userId: number): Promise<{ url: string; filename: string }> {
        const project = await this.findOne(projectId, role, userId);
        if (role !== Role.ADMIN && project.status !== ProjectStatus.SENT) {
            throw new NotFoundException('Project not found');
        }

        const version = project.versions.find((candidate) => candidate.files.some((file) => file.id === fileId));
        const file = version?.files.find((candidate) => candidate.id === fileId);
        if (!version || !file) throw new NotFoundException('Project file not found');
        if (!file.uploadedAt) {
            throw new ConflictException({ message: 'The file has not finished uploading.', error: 'PROJECT_FILE_NOT_UPLOADED' });
        }

        const url = await this.s3Service.presignedDownloadUrl(projectFileKey(project.id, version.id, file.id), {
            filename: file.originalName,
            contentType: file.contentType,
        });

        return { url, filename: file.originalName };
    }

    /**
     * The thumbnail bytes, for the group screen and the gallery.
     *
     * Served through the API rather than as a signed URL because it is displayed inline in a
     * hundred `<img>` tags on one screen, and a hundred signatures per page load is a lot of
     * cryptography for a picture the browser will cache. It is safe to render inline in a way an
     * uploaded file is not: these bytes were produced by sharp on this server, not supplied by
     * whoever wrote to the share.
     */
    async thumbnail(projectId: number, role: Role, userId: number): Promise<Buffer> {
        const project = await this.findOne(projectId, role, userId);
        if (role !== Role.ADMIN && project.status !== ProjectStatus.SENT) {
            throw new NotFoundException('Project not found');
        }
        if (!project.hasThumbnail) throw new NotFoundException('This project has no thumbnail');

        return this.s3Service.downloadFile(projectThumbnailKey(project.id));
    }

    /**
     * Move a document to the child it actually belongs to. E14/S7.
     *
     * No re-upload: the objects stay where they are, because the key holds identifiers of the
     * project, not of the child. That is the same property that made keys-without-names worth
     * insisting on, showing up somewhere else.
     *
     * The answer says whether the email had already gone and to whom, because that is the question
     * an admin asks the moment they notice — and the epic is explicit that the reply to it is a
     * phone call, not a second email saying "ignore the picture you received".
     */
    async reassign(projectId: number, dto: ReassignProjectDto, userId: number): Promise<Project> {
        const project = await this.projectRepository.findOne({ where: { id: projectId }, relations: ['child'] });
        if (!project) throw new NotFoundException('Project not found');

        const target = await this.requireChild(dto.childId);
        if (target.id === project.child.id) {
            throw new ConflictException({ message: 'The document is already assigned to that child.', error: 'PROJECT_ALREADY_ASSIGNED' });
        }

        project.reassignedFromChildId = project.child.id;
        project.reassignedAt = new Date();
        project.reassignedBy = { id: userId } as never;
        project.child = target;
        // The session belonged to the previous child's group, so it is re-derived rather than
        // carried across: a document moved between groups would otherwise point at a class the new
        // child was never in.
        project.classSession = await this.findSessionFor(target, toIsoDate(project.capturedOn));

        await this.projectRepository.save(project);
        return this.requireProject(projectId);
    }

    /**
     * Removes a document and its objects. E14/S7, the other half of a correction.
     *
     * The rows go first and the objects after: the reverse order would leave a project pointing at
     * bytes that are gone if the delete failed halfway, which reads to a parent as a broken link
     * rather than as an absence. Orphaned objects are cheap and invisible; orphaned rows are not.
     */
    async deleteProject(id: number): Promise<void> {
        const project = await this.projectRepository.findOne({ where: { id }, relations: ['versions', 'versions.files'] });
        if (!project) throw new NotFoundException('Project not found');

        const keys = project.versions.flatMap((version) => version.files.map((file) => projectFileKey(project.id, version.id, file.id)));
        if (project.hasThumbnail) keys.push(projectThumbnailKey(project.id));

        await this.projectRepository.delete(id);

        for (const key of keys) {
            try {
                await this.s3Service.deleteObject(key);
            } catch (error: unknown) {
                // The row is already gone, so nothing a caller can do differs. Logged rather than
                // raised, because a 500 here would say the deletion failed when it succeeded.
                this.logger.warn(`Deleted project ${id} but could not remove ${key}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * How much is waiting for somebody to press send, and how long it has been waiting — E17/S8.
     *
     * The count on its own is not a signal. Five documents uploaded this afternoon are a normal
     * afternoon; one document uploaded on Tuesday and still here on Friday is the failure E17's risk
     * section names — *ce depinde de un buton nu pleacă dacă nu apasă nimeni*. A screen showing only
     * a number cannot tell those two apart, so the age travels with it everywhere the number goes.
     *
     * **This service owns the question.** `OverviewService` used to count these rows itself, which
     * is the thing E21 says a report must not do: a second place that decides what "waiting" means
     * is a second place for it to drift. One grouped query answers for the whole school and for each
     * group at once, so the nav badge, the group cards and the dashboard tile cannot disagree.
     */
    async pendingSummary(now: Date = new Date()): Promise<PendingSummary> {
        const rows = await this.projectRepository
            .createQueryBuilder('project')
            .innerJoin('project.child', 'child')
            .leftJoin('child.group', 'group')
            .select('group.id', 'groupId')
            .addSelect('COUNT(*)::int', 'count')
            // The earliest upload in the group; `daysWaiting` turns it into the number on the screen.
            .addSelect('MIN(project.createdAt)', 'oldest')
            .andWhere('project.status = :status', { status: ProjectStatus.NEW })
            .groupBy('group.id')
            .getRawMany<{ groupId: number | null; count: number; oldest: Date | string }>();

        const byGroup = rows
            // A document whose child sits in no group has nowhere to be listed, so it cannot be
            // pressed from a group screen. It still counts in the total — that is the point of a
            // total — and `reassign` is the way out of the state.
            .filter((row): row is { groupId: number; count: number; oldest: Date | string } => row.groupId !== null)
            .map((row) => ({
                groupId: row.groupId,
                count: row.count,
                oldestDays: daysWaiting(new Date(row.oldest), now),
            }))
            .sort((a, b) => b.oldestDays - a.oldestDays || b.count - a.count);

        const total = rows.reduce((sum, row) => sum + row.count, 0);
        const oldest = rows.reduce<Date | null>((earliest, row) => {
            const at = new Date(row.oldest);
            return earliest === null || at < earliest ? at : earliest;
        }, null);

        return {
            total,
            oldestDays: oldest === null ? null : daysWaiting(oldest, now),
            staleAfterDays: STALE_PENDING_DAYS,
            byGroup,
        };
    }

    /** Everything the group screen needs about children who have nothing yet — a read, never a write. */
    async childrenWithoutProjects(groupId: number, on: string): Promise<Child[]> {
        return this.childRepository
            .createQueryBuilder('child')
            .leftJoin('child.group', 'group')
            .andWhere('group.id = :groupId', { groupId })
            .andWhere((qb) => {
                const sub = qb
                    .subQuery()
                    .select('1')
                    .from(Project, 'project')
                    .where('project.child_id = child.id')
                    .andWhere('project.capturedOn = :on')
                    .getQuery();
                return `NOT EXISTS ${sub}`;
            })
            .setParameter('on', on)
            .orderBy('child.firstName', 'ASC')
            .getMany();
    }

    /** Used by the delivery service, which needs the same relations and the same definition of "one project". */
    async requireProject(id: number): Promise<Project> {
        const project = await this.projectRepository.findOne({ where: { id }, relations: PROJECT_RELATIONS });
        if (!project) throw new NotFoundException('Project not found');
        return project;
    }

    private async findByIngestionKey(key: string): Promise<Project | null> {
        const file = await this.fileRepository.findOne({ where: { ingestionKey: key }, relations: ['version', 'version.project'] });
        if (!file) return null;
        return this.projectRepository.findOne({ where: { id: file.version.project.id }, relations: PROJECT_RELATIONS });
    }

    private async requireChild(childId: number): Promise<Child> {
        const child = await this.childRepository.findOne({ where: { id: childId }, relations: ['parent', 'parent.user', 'group'] });
        if (!child) throw new NotFoundException('Child not found');
        return child;
    }

    private async loadProjectForVersioning(manager: EntityManager, projectId: number, childId: number): Promise<Project> {
        const project = await manager.findOne(Project, { where: { id: projectId }, relations: ['child'] });
        if (!project) throw new NotFoundException('Project not found');
        if (project.child.id !== childId) {
            // Adding a version to another child's project would attach one child's work to another
            // child's name — the same disclosure `reassign` exists to undo, arriving through the
            // front door.
            throw new ConflictException({ message: 'That project belongs to a different child.', error: 'PROJECT_CHILD_MISMATCH' });
        }
        return project;
    }

    /**
     * The class this work was done in, when one can be worked out.
     *
     * Null is an ordinary answer, not a failure: the timetable is generated eight weeks ahead, so a
     * document added by hand for something done last term has no session to point at, and a child
     * with no group has none either.
     */
    private async findSessionFor(child: Child, capturedOn: string): Promise<ClassSession | null> {
        if (!child.group) return null;
        return this.classSessionRepository.findOne({ where: { group: { id: child.group.id }, date: parseIsoDate(capturedOn) } });
    }

    private async attachThumbnail(projectId: number, bytes: Buffer): Promise<void> {
        const thumbnail = await this.thumbnailService.fromImage(bytes);
        if (!thumbnail) return;

        try {
            await this.s3Service.putObject({ key: projectThumbnailKey(projectId), body: thumbnail, contentType: 'image/jpeg' });
            await this.projectRepository.update(projectId, { hasThumbnail: true });
        } catch (error: unknown) {
            this.logger.warn(`Project ${projectId} uploaded, but its thumbnail did not: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

/** Signals that another pass inserted the same content first, so this transaction has nothing to do. */
class IngestionRaceError extends Error {
    constructor() {
        super('Another upload claimed this content first');
        this.name = 'IngestionRaceError';
    }
}

/**
 * Turns a rejected file into the right HTTP answer, with a code the interface can translate.
 *
 * Refused is not the same as lost: the agent leaves the file in `_neatribuite` and reports it, so it
 * shows up on the group screen with the reason. Nothing disappears quietly.
 */
function rejection(reason: string | undefined, fileName: string) {
    switch (reason) {
        case 'too_large':
            return new PayloadTooLargeException({
                message: `"${fileName}" is past the size limit of ${Math.round(sizeLimitFor(fileName) / (1024 * 1024))}MB.`,
                error: 'PROJECT_FILE_TOO_LARGE',
            });
        case 'content_mismatch':
            return new UnsupportedMediaTypeException({
                message: `"${fileName}" is not what its extension says it is.`,
                error: 'PROJECT_FILE_CONTENT_MISMATCH',
            });
        default:
            return new UnsupportedMediaTypeException({
                message: `"${fileName}" is not a file type the school accepts.`,
                error: 'PROJECT_FILE_TYPE_NOT_ALLOWED',
            });
    }
}

/** `robot-final.sb3` becomes "robot-final". A name is a better default title than an empty string. */
function titleFromFileName(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    const base = dot > 0 ? fileName.slice(0, dot) : fileName;
    return base.trim().slice(0, 200) || 'Proiect';
}

/**
 * The next number within a project, read under the transaction that is about to use it.
 *
 * Two concurrent uploads can still compute the same number; the unique constraint on
 * `(project, versionNumber)` is what settles it, and the loser retries as a fresh request. Counting
 * here and constraining there is the same division as everywhere else in this file: the database
 * decides, the code proposes.
 */
async function nextVersionNumber(manager: EntityManager, projectId: number): Promise<number> {
    const highest = await manager
        .createQueryBuilder(ProjectVersion, 'version')
        .select('MAX(version.versionNumber)', 'max')
        .andWhere('version.project_id = :projectId', { projectId })
        .getRawOne<{ max: number | null }>();

    return (highest?.max ?? 0) + 1;
}
