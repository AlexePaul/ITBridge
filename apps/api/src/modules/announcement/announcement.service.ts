import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Announcement } from 'src/entities/announcement.entity';
import { Child } from 'src/entities/child.entity';
import { Group } from 'src/entities/group.entity';
import { Location } from 'src/entities/location.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { Profile } from 'src/entities/profile.entity';
import { AnnouncementAudience } from 'src/enum/announcement-audience.enum';
import { MessageKind } from 'src/enum/message-kind.enum';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { schoolDay } from 'src/common/school-clock';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { childNamesIn, composeAnnouncement, SAMPLE_FIRST_NAME, TEST_SUBJECT_PREFIX } from './announcement-text';
import { SendAnnouncementDto } from './dto/sendAnnouncement.dto';

/** One inbox the announcement resolves to, and everything that decides whether it can be written to. */
interface Recipient {
    parentId: number;
    firstName: string;
    lastName: string;
    email: string | null;
    /** False only when there is an account whose confirmation link nobody has opened (E11/S2). */
    confirmed: boolean;
    marketingOptIn: boolean;
}

/** How the audience breaks down before anything is sent. The numbers the confirm dialog shows. */
export interface AudienceBreakdown {
    total: number;
    deliverable: number;
    noAddress: number;
    unconfirmedAddress: number;
    /** Marketing only. Always zero on a transactional announcement, which consults no preference. */
    declined: number;
}

export interface AnnouncementPreview {
    /** What the confirm dialog names: a group, an address, or the whole school. */
    audienceLabel: string;
    recipients: AudienceBreakdown;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    /** Children's first names found in the text — E17/S7's one privacy rule, made mechanical. */
    warnings: string[];
}

export interface UndeliverableRecipient {
    parentId: number;
    parentName: string;
    reason: 'no_address' | 'unconfirmed_address';
}

export interface AnnouncementResult {
    id: number;
    audienceLabel: string;
    queued: number;
    declined: number;
    undeliverable: UndeliverableRecipient[];
}

export interface AnnouncementSummary {
    id: number;
    audience: AnnouncementAudience;
    groupName: string | null;
    locationName: string | null;
    kind: MessageKind;
    subject: string;
    bodyText: string;
    sentByUsername: string | null;
    recipientCount: number;
    declinedCount: number;
    createdAt: Date;
    /** Counted over the queue as it stands now, not frozen at send time. */
    deliveries: Record<OutboxStatus, number>;
}

export interface AnnouncementDetail extends AnnouncementSummary {
    messages: OutboxMessage[];
}

/**
 * Announcements — E17/S7.
 *
 * The one sender that writes to more than one family at a time, and therefore the one with rules of
 * its own:
 *
 *  - **Nothing about a particular child.** Every other message in the system is *about* somebody's
 *    child and goes to that child's parent. This one is the reverse — it addresses a group, an
 *    address or the school — so a child's name in the body is a leak rather than a detail. The
 *    check is mechanical and the warning is acknowledgeable, in the shape E11/S6 established.
 *  - **One message per parent**, like everywhere else. A family with three children in the same
 *    group is one person reading one inbox; the audience is deduplicated by parent, not by child.
 *  - **The marketing preference is consulted, when the announcement is marketing.** Without that,
 *    an announcement to every family would be the hole in the guarantee E17/S4 spent a story
 *    building.
 *  - **The same words to the same audience on the same day are refused.** A broadcast cannot be
 *    recalled, so the failure to design against is the double press, not the missing one.
 *
 * The messages themselves are ordinary outbox rows. `OutboxService` is not modified and knows
 * nothing about announcements: the rows are linked back here after they are queued, inside the same
 * transaction, so the shared queue keeps behaving identically for every other sender.
 */
@Injectable()
export class AnnouncementService {
    private readonly logger = new Logger('Announcements');

    constructor(
        @InjectRepository(Announcement) private readonly announcementRepository: Repository<Announcement>,
        @InjectRepository(OutboxMessage) private readonly outboxRepository: Repository<OutboxMessage>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Location) private readonly locationRepository: Repository<Location>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        private readonly outbox: OutboxService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    /**
     * What would go out, to how many, and what looks wrong about it — the preview E17/S7 asks for.
     *
     * The story leans on this screen: it is where an announcement naming a child is supposed to be
     * caught, and it can only be caught if it can be seen. So the preview renders the real composed
     * message rather than an approximation of it, and reports the audience as several numbers rather
     * than one — "42 de familii" hides that four of them have no address to write to.
     */
    async preview(dto: SendAnnouncementDto): Promise<AnnouncementPreview> {
        const { recipients, label } = await this.resolveAudience(dto);
        const kind = dto.kind ?? MessageKind.TRANSACTIONAL;
        const composed = composeAnnouncement(recipients[0]?.firstName ?? SAMPLE_FIRST_NAME, dto.subject, dto.body);

        return {
            audienceLabel: label,
            recipients: breakdown(recipients, kind),
            ...composed,
            warnings: await this.warningsFor(dto),
        };
    }

    /**
     * One copy to the person about to press send — the test send E17's risk section asks for before
     * any mass mailing.
     *
     * It goes to the admin's own address when they have one, and to the office otherwise, and the
     * reply says which: a test whose destination is a guess is a test nobody can go and read. The
     * subject is prefixed, so a copy landing in a shared office inbox cannot be mistaken for the
     * real announcement.
     *
     * No dedupe key. Tests are meant to be repeated after a wording change; that is what they are.
     */
    async sendTest(dto: SendAnnouncementDto, userId: number): Promise<{ to: string }> {
        const profile = await this.profileRepository.findOne({ where: { user: { id: userId } } });
        const to = profile?.email ?? officeAddress();
        const composed = composeAnnouncement(profile?.firstName ?? SAMPLE_FIRST_NAME, dto.subject, dto.body);

        await this.outbox.queue({
            to,
            subject: `${TEST_SUBJECT_PREFIX}${composed.subject}`,
            bodyText: composed.bodyText,
            bodyHtml: composed.bodyHtml,
        });

        return { to };
    }

    /**
     * The broadcast itself.
     *
     * Everything is one transaction: the announcement row, every message it produces, and the link
     * between them. Split apart, a crash in the middle leaves a record claiming forty families were
     * written to and a queue holding nine of the messages — which is worse than either failure
     * alone, because the record is the thing anybody would go and check.
     */
    async send(dto: SendAnnouncementDto, userId: number): Promise<AnnouncementResult> {
        const { recipients, label, group, location } = await this.resolveAudience(dto);
        const kind = dto.kind ?? MessageKind.TRANSACTIONAL;

        const warnings = await this.warningsFor(dto);
        if (warnings.length > 0 && !dto.acknowledgeWarnings) {
            throw new ConflictException({
                message: `Mesajul conține prenumele unui copil: ${warnings.join(', ')}. Un anunț se adresează unei grupe sau unei locații și nu are voie să vorbească despre un copil anume. Confirmă dacă e o coincidență.`,
                error: 'ANNOUNCEMENT_NAMES_A_CHILD',
                details: warnings,
            });
        }

        if (recipients.length === 0) {
            // Not silently successful: the audience is a query, and an empty one almost always
            // means the wrong group was picked rather than that the school has no families.
            throw new ConflictException({
                message: `Nu există nicio familie în audiența aleasă (${label}), deci anunțul nu are cui să plece.`,
                error: 'ANNOUNCEMENT_NO_RECIPIENTS',
            });
        }

        return this.dataSource.transaction(async (manager) => {
            // `ON CONFLICT DO NOTHING`, like the outbox's own insert: a unique violation would abort
            // the whole transaction, and what is wanted here is a 409 with an explanation.
            const inserted = await manager
                .createQueryBuilder()
                .insert()
                .into(Announcement)
                .values({
                    audience: dto.audience,
                    group: group ?? null,
                    location: location ?? null,
                    kind,
                    subject: dto.subject,
                    bodyText: dto.body,
                    sentBy: { id: userId },
                    recipientCount: recipients.length,
                    dedupeKey: announcementDedupeKey(dto, kind, new Date()),
                })
                .orIgnore()
                .returning('id')
                .execute();

            const announcementId = (inserted.raw as { id: number }[])[0]?.id;
            if (announcementId === undefined) {
                throw new ConflictException({
                    message: 'Același anunț a plecat deja astăzi către aceeași audiență. Dacă vrei totuși să îl retrimiți, schimbă textul.',
                    error: 'ANNOUNCEMENT_ALREADY_SENT',
                });
            }

            const messageIds: number[] = [];
            const undeliverable: UndeliverableRecipient[] = [];
            let declined = 0;

            for (const recipient of recipients) {
                const composed = composeAnnouncement(recipient.firstName, dto.subject, dto.body);
                const message = {
                    subject: composed.subject,
                    bodyText: composed.bodyText,
                    bodyHtml: composed.bodyHtml,
                    // The announcement id is in the key, so the same words sent to the same parent
                    // again tomorrow — a correction — do not collide with today's.
                    dedupeKey: `announcement:${announcementId}:${recipient.parentId}`,
                };

                const queued =
                    kind === MessageKind.MARKETING
                        ? await this.outbox.queueMarketing(recipient, message, manager)
                        : await this.outbox.queueOrRecord(recipient, message, manager);

                if (!queued) {
                    // Only reachable on a marketing refusal: the dedupe key carries a fresh
                    // announcement id, so there is nothing for it to collide with. A refusal
                    // deliberately leaves no row — nobody was owed this message (E17/S4).
                    declined += 1;
                    continue;
                }

                messageIds.push(queued.id);
                if (queued.undeliverableReason) {
                    undeliverable.push({
                        parentId: recipient.parentId,
                        parentName: `${recipient.firstName} ${recipient.lastName}`.trim(),
                        reason: queued.undeliverableReason,
                    });
                }
            }

            if (messageIds.length > 0) {
                await manager.update(OutboxMessage, messageIds, { announcement: { id: announcementId } });
            }
            if (declined > 0) {
                await manager.update(Announcement, announcementId, { declinedCount: declined });
            }

            this.logger.log(`Announcement ${announcementId} (${label}): ${messageIds.length} message(s) queued, ${declined} declined.`);
            return { id: announcementId, audienceLabel: label, queued: messageIds.length, declined, undeliverable };
        });
    }

    /** Every announcement ever sent, newest first, each with live counts over its messages. */
    async list(): Promise<AnnouncementSummary[]> {
        const announcements = await this.announcementRepository.find({
            relations: { group: true, location: true, sentBy: true },
            order: { createdAt: 'DESC' },
        });
        const counts = await this.deliveryCounts();

        return announcements.map((announcement) => this.toSummary(announcement, counts.get(announcement.id)));
    }

    /** One announcement, with every message it produced — the delivery report of the acceptance. */
    async findOne(id: number): Promise<AnnouncementDetail> {
        const announcement = await this.announcementRepository.findOne({
            where: { id },
            relations: { group: true, location: true, sentBy: true },
        });
        if (!announcement) throw new NotFoundException('No such announcement');

        const messages = await this.outboxRepository.find({ where: { announcement: { id } }, order: { id: 'ASC' } });
        const counts = new Map<OutboxStatus, number>();
        for (const message of messages) counts.set(message.status, (counts.get(message.status) ?? 0) + 1);

        return { ...this.toSummary(announcement, counts), messages };
    }

    /**
     * How many messages each announcement has in each state, in one grouped query.
     *
     * One query for the whole list rather than one per row: the screen is a scan, and a broadcast of
     * forty messages is a single line on it.
     */
    private async deliveryCounts(): Promise<Map<number, Map<OutboxStatus, number>>> {
        const rows = await this.outboxRepository
            .createQueryBuilder('message')
            .innerJoin('message.announcement', 'announcement')
            .select('announcement.id', 'announcementId')
            .addSelect('message.status', 'status')
            .addSelect('COUNT(*)::int', 'count')
            .groupBy('announcement.id')
            .addGroupBy('message.status')
            .getRawMany<{ announcementId: number; status: OutboxStatus; count: number }>();

        const byAnnouncement = new Map<number, Map<OutboxStatus, number>>();
        for (const row of rows) {
            const counts = byAnnouncement.get(row.announcementId) ?? new Map<OutboxStatus, number>();
            counts.set(row.status, row.count);
            byAnnouncement.set(row.announcementId, counts);
        }
        return byAnnouncement;
    }

    private toSummary(announcement: Announcement, counts?: Map<OutboxStatus, number>): AnnouncementSummary {
        return {
            id: announcement.id,
            audience: announcement.audience,
            groupName: announcement.group?.name ?? null,
            locationName: announcement.location?.name ?? null,
            kind: announcement.kind,
            subject: announcement.subject,
            bodyText: announcement.bodyText,
            sentByUsername: announcement.sentBy?.username ?? null,
            recipientCount: announcement.recipientCount,
            declinedCount: announcement.declinedCount,
            createdAt: announcement.createdAt,
            deliveries: {
                // Every state present even at zero: a missing "failed: 0" reads as "not measured".
                [OutboxStatus.PENDING]: counts?.get(OutboxStatus.PENDING) ?? 0,
                [OutboxStatus.SENT]: counts?.get(OutboxStatus.SENT) ?? 0,
                [OutboxStatus.FAILED]: counts?.get(OutboxStatus.FAILED) ?? 0,
                [OutboxStatus.UNDELIVERABLE]: counts?.get(OutboxStatus.UNDELIVERABLE) ?? 0,
                // Always zero in practice: an announcement is never queued as combinable (E17/S6),
                // because the person who pressed send chose the moment. Present because the record
                // covers every state — a missing one reads as "not measured".
                [OutboxStatus.DIGESTED]: counts?.get(OutboxStatus.DIGESTED) ?? 0,
            },
        };
    }

    /**
     * The audience, as inboxes.
     *
     * A family is in it when they have a child **in a group** matching the scope, trials included: a
     * trial child sits in that room on that Saturday like everybody else (D7). Membership is read
     * off `Child.group`, the derived column `EnrollmentService` is the sole writer of, which is what
     * E12's cancellation notices read too — and the reason both answer the same way.
     *
     * A family whose child is in no group at all is nobody's audience here, and that is what
     * "părinții activi" means in the story's acceptance: a day off does not concern a family that
     * has not been given an hour yet.
     */
    private async resolveAudience(dto: SendAnnouncementDto): Promise<{ recipients: Recipient[]; label: string; group?: Group; location?: Location }> {
        const qb = this.childRepository
            .createQueryBuilder('child')
            .innerJoin('child.group', 'group')
            .innerJoin('group.room', 'room')
            .innerJoin('room.location', 'location')
            .innerJoinAndSelect('child.parent', 'parent')
            .leftJoinAndSelect('parent.user', 'user');

        let group: Group | undefined;
        let location: Location | undefined;
        let label: string;

        switch (dto.audience) {
            case AnnouncementAudience.GROUP: {
                if (dto.groupId === undefined) throw new BadRequestException('An announcement to a group needs groupId');
                group = (await this.groupRepository.findOne({ where: { id: dto.groupId } })) ?? undefined;
                if (!group) throw new NotFoundException('No such group');
                qb.andWhere('group.id = :groupId', { groupId: dto.groupId });
                label = `Grupa ${group.name}`;
                break;
            }
            case AnnouncementAudience.LOCATION: {
                if (dto.locationId === undefined) throw new BadRequestException('An announcement to a location needs locationId');
                location = (await this.locationRepository.findOne({ where: { id: dto.locationId } })) ?? undefined;
                if (!location) throw new NotFoundException('No such location');
                qb.andWhere('location.id = :locationId', { locationId: dto.locationId });
                label = location.name;
                break;
            }
            default:
                label = 'Toată școala';
        }

        const children = await qb.getMany();
        const byParent = new Map<number, Recipient>();
        for (const child of children) {
            const parent = child.parent;
            if (!parent || byParent.has(parent.id)) continue;
            byParent.set(parent.id, {
                parentId: parent.id,
                firstName: parent.firstName,
                lastName: parent.lastName,
                email: parent.email ?? null,
                // No account at all is not "unconfirmed": that is the family an admin typed in from
                // a phone call, and the address they gave is the one the school was told to use.
                confirmed: !parent.user || parent.user.emailConfirmedAt !== null,
                marketingOptIn: parent.marketingOptIn,
            });
        }

        return { recipients: [...byParent.values()], label, group, location };
    }

    /** Every child's first name that appears in the announcement — the leak check, over all of them. */
    private async warningsFor(dto: SendAnnouncementDto): Promise<string[]> {
        const children = await this.childRepository.find({ select: { id: true, firstName: true } });
        return childNamesIn(
            `${dto.subject}\n${dto.body}`,
            children.map((child) => child.firstName),
        );
    }
}

function breakdown(recipients: Recipient[], kind: MessageKind): AudienceBreakdown {
    const marketing = kind === MessageKind.MARKETING;
    const counts: AudienceBreakdown = { total: recipients.length, deliverable: 0, noAddress: 0, unconfirmedAddress: 0, declined: 0 };

    for (const recipient of recipients) {
        // The order matters and matches the send: a family that has not opted in is not written to
        // at all, so it is counted as declined rather than as one address problem or another.
        if (marketing && !recipient.marketingOptIn) counts.declined += 1;
        else if (!recipient.email) counts.noAddress += 1;
        else if (!recipient.confirmed) counts.unconfirmedAddress += 1;
        else counts.deliverable += 1;
    }

    return counts;
}

/**
 * What makes two presses "the same announcement".
 *
 * Audience, wording and the calendar day at the **school**, hashed because `dedupeKey` is 255
 * characters and a body is not. The day is the school's own rather than the server's: a guard whose
 * boundary falls at three in the morning local time is a guard nobody can reason about, and the
 * repository has the off-by-one-day trap written down twice already.
 *
 * A wording change of one character makes it a different announcement, which is deliberate. The
 * failure being designed against is the identical second press, not a correction sent five minutes
 * later — that one is a different message, and the families need it.
 */
export function announcementDedupeKey(dto: SendAnnouncementDto, kind: MessageKind, now: Date): string {
    const scope = [dto.audience, dto.groupId ?? '', dto.locationId ?? '', kind, dto.subject, dto.body].join(' ');
    return `announcement:${schoolDay(now)}:${createHash('sha256').update(scope).digest('hex').slice(0, 32)}`;
}
