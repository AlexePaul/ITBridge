import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Project } from 'src/entities/project.entity';
import { OutboxAttachment } from 'src/entities/outbox-message.entity';
import { ProjectStatus } from 'src/enum/project-status.enum';
import { Role } from 'src/enum/role.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { adminGroupProjectsUrl, projectGalleryUrl, projectUrl } from 'src/modules/auth/portal-urls';
import { projectThumbnailKey } from './project.keys';
import { composeProjectDelivery, composeProjectReport, DeliveredProject } from './project-mail';
import { SendProjectsDto } from './dto/sendProjects.dto';
import { ReportProjectDto } from './dto/reportProject.dto';
import { ProjectService } from './project.service';

/** Mirrors `SendProjectsResult` from the contract; the shapes are checked against it in `contract.ts`. */
export interface SendReportRecipient {
    parentId: number;
    parentName: string;
    email: string | null;
    projectIds: number[];
    reason?: 'no_email' | 'email_unconfirmed';
}

export interface SendReport {
    queued: SendReportRecipient[];
    skipped: { projectId: number; reason: 'already_sent' | 'upload_incomplete' }[];
    undeliverable: SendReportRecipient[];
}

/**
 * How many thumbnails one message carries.
 *
 * Not a technical ceiling — it is the size of the email a parent opens on a phone. Past three
 * pictures the message is a slideshow rather than a note, and the remaining documents are still
 * listed by name with their links; nothing is hidden, only unpictured.
 */
const MAX_INLINE_THUMBNAILS = 3;

/**
 * The send an admin presses, and the report a parent can send back. E14/S4 and S7.
 *
 * Separate from `ProjectService` because it is a different job: that one is about what a document
 * *is*, this one about what leaves the building. The mechanism itself belongs to E17/S8 — this is
 * only what "send" means for a child's work.
 */
@Injectable()
export class ProjectDeliveryService {
    private readonly logger = new Logger('Projects');

    constructor(
        @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
        private readonly projectService: ProjectService,
        private readonly outbox: OutboxService,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * Queues one message per parent for the documents an admin has ticked. E14/S4.
     *
     * Three rules, all of them load-bearing:
     *
     *  - **The selection is per group, the sending is per parent.** One press produces N messages,
     *    each with exactly one recipient and exactly that recipient's own children's documents.
     *    Nothing a child built reaches another family, as a thumbnail, a title or a link.
     *  - **A parent with two children in the same press gets one message**, listing both. Being
     *    triggered by a human is not a loophole through the anti-burst rule in E17/S6.
     *  - **A second press sends nothing.** A document already `sent` is skipped and the admin is
     *    told why, so a nervous click on a slow connection cannot double a group.
     *
     * The queueing and the status change are one transaction. That is the word *transactional* in
     * "transactional outbox": either the parent is going to be written to and the document says so,
     * or neither happened. Split apart, a crash in between produces a document marked sent that
     * nobody will ever receive — which is worse than one sent twice, because nothing shows it.
     */
    async send(dto: SendProjectsDto, _userId: number): Promise<SendReport> {
        const projects = await this.projectRepository.find({
            where: { id: In(dto.projectIds) },
            relations: ['child', 'child.parent', 'child.parent.user', 'child.group', 'versions', 'versions.files'],
        });

        const missing = dto.projectIds.filter((id) => !projects.some((project) => project.id === id));
        if (missing.length > 0) {
            throw new NotFoundException(`No such project: ${missing.join(', ')}`);
        }

        const report: SendReport = { queued: [], skipped: [], undeliverable: [] };
        const sendable: Project[] = [];

        for (const project of projects) {
            if (project.status === ProjectStatus.SENT) {
                report.skipped.push({ projectId: project.id, reason: 'already_sent' });
                continue;
            }
            // A file whose bytes never finished arriving would mail a parent a link to nothing. The
            // large-upload road registers the row before the object exists, so this is a real state
            // and not a defensive check.
            if (project.versions.some((version) => version.files.some((file) => !file.uploadedAt))) {
                report.skipped.push({ projectId: project.id, reason: 'upload_incomplete' });
                continue;
            }
            sendable.push(project);
        }

        for (const [, group] of groupByParent(sendable)) {
            const parent = group[0].child.parent;
            const recipient: SendReportRecipient = {
                parentId: parent.id,
                parentName: `${parent.firstName} ${parent.lastName}`.trim(),
                email: parent.email ?? null,
                projectIds: group.map((project) => project.id),
            };

            const refusal = undeliverableReason(group[0]);
            if (refusal) {
                // Not skipped silently: a parent who does not get their child's documents is not
                // getting their invoices either. The report answers the admin standing in front of
                // the screen; the outbox row answers the question asked three weeks later — E17/S5,
                // which now exists, so this writes to both.
                report.undeliverable.push({ ...recipient, reason: refusal });
                await this.outbox.queueOrRecord(
                    { email: parent.email, confirmed: refusal !== 'email_unconfirmed' },
                    {
                        subject: `Proiectele lui ${group[0].child.firstName}`,
                        bodyText: `Nu am putut trimite ${group.length} document(e) către ${recipient.parentName}.`,
                    },
                );
                continue;
            }

            await this.queueFor(parent.email as string, group);
            report.queued.push(recipient);
        }

        return report;
    }

    /**
     * One parent, one message, and the documents marked sent in the same transaction.
     */
    private async queueFor(email: string, projects: Project[]): Promise<void> {
        const items: DeliveredProject[] = projects.map((project) => ({
            childFirstName: project.child.firstName,
            title: project.title,
            url: projectUrl(project.publicId),
            ...(project.hasThumbnail ? { contentId: contentIdFor(project.id) } : {}),
        }));

        const attachments: OutboxAttachment[] = projects
            .filter((project) => project.hasThumbnail)
            .slice(0, MAX_INLINE_THUMBNAILS)
            .map((project) => ({
                filename: `proiect-${project.id}.jpg`,
                contentId: contentIdFor(project.id),
                storageKey: projectThumbnailKey(project.id),
            }));

        // Anything past the picture budget keeps its place in the list but loses its `cid:`
        // reference, because a `cid:` with no attachment behind it renders as a broken image — worse
        // than a line of text.
        const attachedIds = new Set(attachments.map((attachment) => attachment.contentId));
        for (const item of items) {
            if (item.contentId && !attachedIds.has(item.contentId)) delete item.contentId;
        }

        const parent = projects[0].child.parent;
        const mail = composeProjectDelivery(parent.firstName, items, projectGalleryUrl());

        await this.dataSource.transaction(async (manager) => {
            const queued = await this.outbox.queue(
                {
                    to: email,
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? null,
                    attachments,
                    // Derived from the exact set of documents, so pressing send twice on the same
                    // selection collides in the database rather than in a check that races two
                    // admins on two screens. `status` already stops the ordinary second press; this
                    // stops the simultaneous one.
                    dedupeKey: deliveryDedupeKey(parent.id, projects),
                    // Combinable — E17/S6, and the case E17/S8 names outright: a parent with
                    // children in two groups, both sent on the same afternoon, gets one message
                    // rather than two. The split here is already per parent within a single press;
                    // this is what makes it hold across two presses, which no amount of grouping
                    // inside one of them could.
                    digest: mail.digestSummary ? { summary: mail.digestSummary } : null,
                },
                manager,
            );

            await manager.update(
                Project,
                projects.map((project) => project.id),
                {
                    status: ProjectStatus.SENT,
                    sentAt: new Date(),
                    sentToEmail: email,
                    sentOutboxMessageId: queued?.id ?? null,
                },
            );

            if (!queued) {
                // The identical message is already in the queue. The documents are still marked
                // sent, because they are: one message covering them exists and is going out.
                this.logger.log(`Delivery for parent ${parent.id} was already queued; marked ${projects.length} document(s) as sent without a second message.`);
            }
        });
    }

    /**
     * A parent saying "this does not look like my child's work". E14/S7.
     *
     * It goes to the office, never back to the family, and it deliberately gives the parent no way
     * to delete anything. That is not politeness: `PARENT_WRITABLE` in `authorization.spec.ts`
     * enumerates every write a parent may perform, and a parent deleting a `Project` would need a
     * new entry in exactly the list that keeps such decisions deliberate.
     */
    async report(publicId: string, dto: ReportProjectDto, role: Role, userId: number): Promise<{ reported: true }> {
        const project = await this.projectService.findByPublicId(publicId, role, userId);
        const parent = project.child.parent;
        const mail = composeProjectReport(
            { id: project.id, title: project.title, childName: `${project.child.firstName} ${project.child.lastName}` },
            `${parent.firstName} ${parent.lastName}`.trim(),
            dto.note ?? null,
            adminGroupProjectsUrl(project.child.group?.id ?? 0),
        );

        // One report per project per person per day. A parent who taps twice because nothing
        // visibly happened should not produce two identical messages to the office; a genuinely
        // different complaint tomorrow still gets through.
        await this.outbox.queue({
            to: officeAddress(),
            subject: mail.subject,
            bodyText: mail.bodyText,
            dedupeKey: `project-report:${project.id}:${userId}:${new Date().toISOString().slice(0, 10)}`,
        });

        return { reported: true };
    }
}

/**
 * Why this parent cannot be written to, or `undefined` when they can.
 *
 * `Profile.email` is nullable and `User` has no email column at all, so a profile an admin typed in
 * from a phone call may genuinely have no address — a deliberate flow, not a broken record. An
 * unconfirmed address is the other case: writing to it would be writing to an address nobody has
 * proved is theirs.
 */
function undeliverableReason(project: Project): 'no_email' | 'email_unconfirmed' | undefined {
    const parent = project.child.parent;
    if (!parent.email) return 'no_email';
    if (parent.user && !parent.user.emailConfirmedAt) return 'email_unconfirmed';
    return undefined;
}

function groupByParent(projects: Project[]): Map<number, Project[]> {
    const byParent = new Map<number, Project[]>();
    for (const project of projects) {
        const key = project.child.parent.id;
        const existing = byParent.get(key);
        if (existing) existing.push(project);
        else byParent.set(key, [project]);
    }
    return byParent;
}

/** `cid:` has to be stable between the HTML and the attachment, and unique within the message. */
function contentIdFor(projectId: number): string {
    return `proiect-${projectId}`;
}

/**
 * Hashed rather than spelled out: `dedupeKey` is 255 characters, and a press covering twenty
 * documents would run past that with a list of ids.
 */
function deliveryDedupeKey(parentId: number, projects: Project[]): string {
    const ids = projects
        .map((project) => project.id)
        .sort((a, b) => a - b)
        .join(',');
    return `project-delivery:${parentId}:${createHash('sha256').update(ids).digest('hex').slice(0, 32)}`;
}
