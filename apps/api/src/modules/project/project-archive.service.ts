import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import archiver from 'archiver';
import type { Readable } from 'stream';
import { Child } from 'src/entities/child.entity';
import { Project } from 'src/entities/project.entity';
import { ProjectStatus } from 'src/enum/project-status.enum';
import { Role } from 'src/enum/role.enum';
import { ObjectNotFoundError, S3Service, sanitizeFilename } from 'src/modules/storage/s3.service';
import { projectFileKey } from './project.keys';

/**
 * Everything one child has built, as a single download. E14/S5.
 *
 * It is the child's work and the parent has to be able to take it with them — a gallery you can
 * only browse is a gallery that disappears when the school's subscription does.
 *
 * **Streamed, never buffered.** The archive is written to the response as each object is read out of
 * the bucket, so the process holds one file at a time rather than a term's worth of a child's work.
 * The API shares an instance with Postgres; a buffered archive is the same mistake as a buffered
 * video upload, arriving from the other direction.
 *
 * **And one object open at a time, which is a separate promise.** `archiver` queues what it is given
 * and reads it in turn, so handing it every object at once opened every object at once: sixty GETs
 * before the parent's browser had read a byte, each holding a socket from the SDK's pool of fifty —
 * the pool every S3 call in the API shares, `/ready` included — for as long as the download took,
 * or for ever when it was abandoned (review of 25 September 2026). `fill` now opens the next object
 * only once the previous entry has been written, and stops when the response goes away.
 */
@Injectable()
export class ProjectArchiveService {
    private readonly logger = new Logger('Projects');

    constructor(
        @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        private readonly s3Service: S3Service,
    ) {}

    /**
     * The archive for one child, and the name to save it under.
     *
     * A parent gets only their own child, and only what has been sent — the same rule as the
     * gallery, for the same reason: a document in `nou` is still in review, and an archive would be
     * a back door around the screen where somebody looks at it first.
     */
    async forChild(childId: number, role: Role, userId: number): Promise<{ archive: Readable; filename: string }> {
        const child = await this.childRepository.findOne({ where: { id: childId }, relations: ['parent', 'parent.user'] });
        if (!child) throw new NotFoundException('Child not found');
        if (role !== Role.ADMIN && child.parent.user?.id !== userId) {
            throw new NotFoundException('Child not found');
        }

        const qb = this.projectRepository
            .createQueryBuilder('project')
            .leftJoinAndSelect('project.versions', 'version')
            .leftJoinAndSelect('version.files', 'file')
            .leftJoinAndSelect('project.links', 'link')
            .andWhere('project.child_id = :childId', { childId });

        if (role !== Role.ADMIN) {
            qb.andWhere('project.status = :sent', { sent: ProjectStatus.SENT });
        }

        const projects = await qb.orderBy('project.capturedOn', 'ASC').getMany();

        const archive = archiver('zip', {
            // Almost everything inside is already compressed — JPEG, MP4, and `.sb3` is a ZIP. Level
            // 9 would spend the office's CPU re-compressing incompressible bytes for a fraction of a
            // percent; the archive here is a container, not a compressor.
            zlib: { level: 1 },
        });

        // Errors after the headers have gone out cannot become a status code — the response is
        // already a 200 with a partial zip. Logged and the stream destroyed, so the client sees a
        // truncated download rather than a file that silently claims to be complete.
        archive.on('warning', (error) => this.logger.warn(`Archive warning for child ${childId}: ${error.message}`));
        archive.on('error', (error) => this.logger.error(`Archive failed for child ${childId}: ${error.message}`));

        // Deliberately not awaited: `finalize` resolves when everything has been appended and
        // written, which cannot happen until the caller starts consuming the stream. Awaiting it
        // here deadlocks the request.
        void this.fill(archive, projects, childId).catch((error: unknown) => {
            this.logger.error(`Could not fill the archive for child ${childId}: ${error instanceof Error ? error.message : String(error)}`);
            archive.destroy(error instanceof Error ? error : new Error(String(error)));
        });

        return { archive, filename: `proiecte-${sanitizeFilename(child.firstName.toLowerCase())}.zip` };
    }

    private async fill(archive: archiver.Archiver, projects: Project[], childId: number): Promise<void> {
        // The response went away — the parent closed the tab, or the connection dropped. Nothing
        // is reading any more, so the object being copied is released and the rest never opened.
        let abandoned = false;
        let current: Readable | null = null;
        archive.once('close', () => {
            abandoned = true;
            current?.destroy();
        });

        for (const project of projects) {
            // A folder per project, named by date and title, because a flat archive of forty
            // files called `proiect.sb3` is not a keepsake. The version number only appears
            // when there is more than one, so the usual case reads cleanly.
            const folder = sanitizeFilename(`${isoDay(project.capturedOn)} ${project.title}`);

            for (const version of project.versions) {
                for (const file of version.files) {
                    if (!file.uploadedAt) continue;
                    if (abandoned) return;

                    try {
                        current = await this.s3Service.downloadStream(projectFileKey(project.id, version.id, file.id));
                    } catch (error: unknown) {
                        // One missing object costs its own entry, not the whole keepsake: the rest of
                        // the archive is still the child's work. Ids only in the log — never a name.
                        if (error instanceof ObjectNotFoundError) {
                            this.logger.warn(`Archive for child ${childId}: file ${file.id} of project ${project.id} is not in the bucket; left out.`);
                            continue;
                        }
                        throw error;
                    }
                    if (abandoned) {
                        current.destroy();
                        return;
                    }

                    const prefix = project.versions.length > 1 ? `${folder}/v${version.versionNumber}` : folder;
                    if (!(await this.write(archive, current, `${prefix}/${sanitizeFilename(file.originalName)}`, () => abandoned))) return;
                    current = null;
                }
            }

            // A link is part of the child's work too, and a `.url` file is what Windows opens.
            for (const link of project.links ?? []) {
                const shortcut = `[InternetShortcut]\r\nURL=${link.url}\r\n`;
                if (!(await this.write(archive, shortcut, `${folder}/${sanitizeFilename(link.label)}.url`, () => abandoned))) return;
            }
        }

        if (!abandoned) await archive.finalize();
    }

    /**
     * One entry, written before the next is opened. False when the download was abandoned on the
     * way — an ordinary end, not a failure worth an error line.
     */
    private async write(archive: archiver.Archiver, source: Readable | string, name: string, abandoned: () => boolean): Promise<boolean> {
        try {
            await written(archive, source, name);
            return true;
        } catch (error: unknown) {
            if (abandoned()) return false;
            throw error;
        }
    }
}

/**
 * Appends one source and resolves once `archiver` has written it — its `entry` event — so the caller
 * can open the next. Rejects if the archive fails or is torn down first, so a waiting `fill` never
 * hangs on a download nobody is reading.
 */
function written(archive: archiver.Archiver, source: Readable | string, name: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const onEntry = () => {
            cleanup();
            resolve();
        };
        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };
        const onClose = () => {
            cleanup();
            reject(new Error('The archive was closed before the entry was written'));
        };
        const cleanup = () => {
            archive.off('entry', onEntry);
            archive.off('error', onError);
            archive.off('close', onClose);
        };
        archive.once('entry', onEntry);
        archive.once('error', onError);
        archive.once('close', onClose);
        archive.append(source, { name });
    });
}

/**
 * The day, from the local components of the value.
 *
 * Not `toISOString().slice(0, 10)`: that is the UTC day, which east of Greenwich — that is, in
 * Romania — is yesterday for anything stored near midnight. The mistake is exactly one day, appears
 * only in some time zones, and does not show up in review.
 */
function isoDay(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 10);
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
}
