import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { ageOf, EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { absencesUrl } from 'src/modules/auth/portal-urls';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { romanianDayAndDate } from 'src/modules/mail/romanian-date';
import { canBackfill } from './absence-notice.rules';
import { isInReplacementWeek, replacementWeekFor } from './replacement.rules';

export const REPLACEMENT_DEDUPE_PREFIX = 'absence-replacement:';

/** One class a child could be moved into, as the office's screen reads it. */
export interface ReplacementOption {
    sessionId: number;
    date: string;
    startTime: string;
    endTime: string;
    groupId: number;
    groupName: string;
    locationName: string | null;
    free: number;
}

/**
 * Moving a child to another group for one week — E12/S4.
 *
 * **The office does this, not the family.** That is the whole difference from what stood here
 * before, which was a credit a parent held and spent from a booking screen. The school reads the
 * week's announced absences on Monday and decides where each child goes, because the decision needs
 * things no query has: which teacher can take one more, which group is having a quiet week, which
 * two children should not be put in a room together. The platform's job is to make the decision
 * cheap to record, hard to record wrongly, and visible to the family afterwards.
 *
 * So there is no state machine here. A notice either names the class the child was moved into or it
 * does not, and everything else is read off the calendar.
 */
@Injectable()
export class ReplacementService {
    private readonly logger = new Logger('Replacement');

    constructor(
        @InjectRepository(AbsenceNotice) private readonly noticeRepository: Repository<AbsenceNotice>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        // D7's owner. Seats — in a group, and at one class — are counted in one place; see
        // `EnrollmentService.freeSeatsAt`.
        private readonly enrollments: EnrollmentService,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
        @InjectDataSource() private readonly dataSource: DataSource,
    ) {}

    /**
     * The classes this child could be moved into.
     *
     * Compatible means, in the order checked: inside the week the class was missed in; not the
     * child's own group, because sitting in on your own class is just attending it; not cancelled;
     * not already started, so that what is offered is still a real thing to arrange; the child's age
     * inside the host group's band; and a seat actually free at that hour.
     *
     * **"Același modul" from the story is not checked, because modules do not exist** — E10 is cut
     * from the MVP. The age band is what the platform has to say two groups teach near-enough the
     * same thing, and it is the same signal enrolment uses.
     */
    async optionsFor(noticeId: number, now: Date = new Date()): Promise<ReplacementOption[]> {
        const notice = await this.requireNotice(noticeId);
        const week = replacementWeekFor(notice.classSession.date);
        const age = ageOf(notice.child.birthDate, now);
        const ownGroupId = notice.classSession.group.id;

        const candidates = await this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoinAndSelect('session.group', 'group')
            .leftJoinAndSelect('session.room', 'room')
            .leftJoinAndSelect('room.location', 'location')
            .andWhere('session.date >= :from AND session.date <= :to', week)
            .andWhere('session.status = :status', { status: ClassSessionStatus.SCHEDULED })
            .andWhere('group.id != :ownGroupId', { ownGroupId })
            .andWhere('group.isActive = true')
            .andWhere('group.minAge <= :age AND group.maxAge >= :age', { age })
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC')
            .getMany();

        // An hour that has begun cannot be offered: whoever is in that room is already in it.
        const open = candidates.filter((session) => canBackfill(session, now));
        // One query for the week's seats, not one per class — the same batching the public trial
        // form relies on, and for the same reason.
        const seats = await this.enrollments.freeSeatsAtSessions(open);

        const options: ReplacementOption[] = [];
        for (const session of open) {
            const free = seats.get(session.id) ?? 0;
            if (free <= 0) continue;
            options.push({
                sessionId: session.id,
                date: toIsoDate(session.date),
                startTime: session.startTime,
                endTime: session.endTime,
                groupId: session.group.id,
                groupName: session.group.name,
                locationName: session.room?.location?.name ?? null,
                free,
            });
        }
        return options;
    }

    /**
     * Records the move, and tells the family where to bring their child.
     *
     * Everything `optionsFor` filtered on is re-checked rather than trusted: that list was a
     * snapshot, and a seat can go between reading it and pressing the button.
     *
     * **The deadline this answers to is the replacement class's own start, not Monday noon.** The
     * Monday deadline (S3) is what the *family* has to meet, and it is frozen on the notice as
     * `inTime`. This one is the office's: parents ring, message and email, and somebody here has to
     * type it in — when nobody does until Tuesday, the family did everything asked of them, and
     * refusing the move would take the week away for a delay that was never theirs. What cannot be
     * forgiven is a class that has already happened, because recording that move would be writing
     * down something that did not occur.
     *
     * **Recording the same move twice is a no-op**, checked before the seat count rather than after
     * it: the child already holds a chair in that class, so counting them against it would refuse
     * the office for repeating itself once the class is full.
     *
     * **The row and the message are one transaction**, as everywhere else that writes to a family.
     * A move recorded without the family told is the failure the outbox exists to prevent — they
     * turn up at the wrong room — and a message about a move that then rolled back is worse. The
     * outbox row is an insert into the same database, so there is no reason for them to be able to
     * disagree.
     */
    async place(noticeId: number, classSessionId: number, now: Date = new Date()): Promise<AbsenceNotice> {
        const notice = await this.requireNotice(noticeId);
        if (notice.replacementSession?.id === classSessionId) return notice;

        const session = await this.classSessionRepository.findOne({
            where: { id: classSessionId },
            relations: { group: true, room: { location: true } },
        });
        if (!session) throw new NotFoundException('Class session not found');

        if (session.group.id === notice.classSession.group.id) {
            throw new BadRequestException({
                message: 'Asta e chiar grupa copilului — nu e o mutare, e ora lui.',
                error: 'REPLACEMENT_SAME_GROUP',
            });
        }
        if (session.status === ClassSessionStatus.CANCELLED) {
            throw new ConflictException({ message: 'Ședința e anulată.', error: 'CLASS_SESSION_CANCELLED' });
        }
        if (!isInReplacementWeek(notice.classSession, session)) {
            throw new ConflictException({
                message: 'Mutarea se face în aceeași săptămână cu ora pierdută.',
                error: 'REPLACEMENT_OUT_OF_WEEK',
            });
        }
        if (!canBackfill(session, now)) {
            throw new ConflictException({
                message: 'Ora asta a început deja — nu mai poate fi consemnată o mutare la ea.',
                error: 'REPLACEMENT_SESSION_STARTED',
            });
        }
        const age = ageOf(notice.child.birthDate, now);
        if (age < session.group.minAge || age > session.group.maxAge) {
            throw new ConflictException({
                message: `Grupa „${session.group.name}" este pentru ${session.group.minAge}-${session.group.maxAge} ani.`,
                error: 'REPLACEMENT_AGE_MISMATCH',
            });
        }
        if ((await this.enrollments.freeSeatsAt(session)) <= 0) {
            throw new ConflictException({ message: 'Nu mai e loc la ședința asta.', error: 'REPLACEMENT_SESSION_FULL' });
        }

        notice.replacementSession = session;
        const saved = await this.dataSource.transaction(async (manager) => {
            const written = await manager.getRepository(AbsenceNotice).save(notice);
            await this.tellTheFamily(notice, session, manager);
            return written;
        });
        this.logger.log(`Child ${notice.child.id} moved to session ${session.id} for the week of ${toIsoDate(notice.classSession.date)}.`);
        return saved;
    }

    /**
     * Undoes the move — the group changed, or it was recorded against the wrong child.
     *
     * No message goes out. A family told twice in ten minutes, once to come and once not to, is
     * being handled by a phone call, not by an outbox; and the common reason to clear this is a
     * typo nobody outside the office should ever have heard about. When the reason is real, the
     * office places the child somewhere else and that message says where.
     */
    async clear(noticeId: number): Promise<AbsenceNotice> {
        const notice = await this.requireNotice(noticeId);
        notice.replacementSession = null;
        return this.noticeRepository.save(notice);
    }

    /**
     * Lets go of every move made into a class that has just been cancelled — called from the
     * cancellation's own transaction, after the families have been told.
     *
     * A child expected at a class that will not happen is a plan the family cannot keep and a chair
     * the office's screen still counts as taken. The absence itself is untouched: the hour was still
     * missed, the week may still have another class in it, and the child goes back on the list of
     * those waiting to be placed.
     */
    async clearOn(classSessionId: number, manager?: EntityManager): Promise<number> {
        const repository = manager ? manager.getRepository(AbsenceNotice) : this.noticeRepository;
        const placed = await repository.find({ where: { replacementSession: { id: classSessionId } } });
        if (placed.length === 0) return 0;

        for (const notice of placed) {
            notice.replacementSession = null;
        }
        await repository.save(placed);
        this.logger.log(`Cancelled session ${classSessionId}: released ${placed.length} temporary move(s).`);
        return placed.length;
    }

    /**
     * The announced absences nobody has placed yet — the office's Monday list.
     *
     * This is the question the deleted expiry reminder used to answer badly. That one warned
     * *families* their credit was running out, which was addressed to somebody with nothing to
     * press; the real question was always internal, and it is this one.
     *
     * **Bounded by the missed class's own week, not by today.** A notice is worth acting on while
     * the week that owes the hour still has days left in it — which includes a class earlier this
     * morning, because the week may well have another that fits, and includes next week's notices,
     * which arrive over the weekend and are exactly what Monday is for. The floor is therefore this
     * week's Monday: everything from it forward is live, everything before it is a week that closed
     * without a move, which is a fact and not a task. Nothing has to run for a row to leave this
     * list — it is placed, or the calendar passes it.
     */
    async unplaced(now: Date = new Date()): Promise<AbsenceNotice[]> {
        return this.noticeRepository
            .createQueryBuilder('notice')
            .leftJoinAndSelect('notice.child', 'child')
            .leftJoinAndSelect('notice.classSession', 'session')
            .leftJoinAndSelect('session.group', 'group')
            .andWhere('notice.replacement_session_id IS NULL')
            .andWhere('session.date >= :from', { from: replacementWeekFor(now).from })
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC')
            .getMany();
    }

    /**
     * The one message this story sends, at the one moment it is worth sending.
     *
     * It replaces an evening cron that told families they had *earned* something. Nothing is earned
     * any more, and nothing waits for the evening either: the useful sentence is „bring her here
     * instead", and it is useful the minute the office decides it — which may be Monday, for a class
     * on Thursday.
     *
     * Queued with the caller's transaction manager, so it cannot outlive a move that rolled back
     * and a move cannot be recorded without it. No mail server is involved here — the outbox is a
     * table, and the dispatcher's bad afternoons are its own.
     */
    private async tellTheFamily(notice: AbsenceNotice, replacement: ClassSession, manager: EntityManager): Promise<void> {
        const parent = notice.child.parent;
        if (!parent) return;

        const where = [
            `grupa ${replacement.group.name}`,
            romanianDayAndDate(replacement.date),
            `ora ${replacement.startTime.slice(0, 5)}`,
            replacement.room?.location?.name ? `la ${replacement.room.location.name}` : null,
        ]
            .filter(Boolean)
            .join(', ');

        const mail = await this.mailTemplates.render('absence-replacement', {
            firstName: parent.firstName,
            childName: notice.child.firstName,
            missed: `${romanianDayAndDate(notice.classSession.date)}, ora ${notice.classSession.startTime.slice(0, 5)}`,
            replacement: where,
            portalUrl: absencesUrl(),
        });
        await this.outbox.queueOrRecord(
            { email: parent.email ?? null },
            {
                subject: mail.subject,
                bodyText: mail.bodyText,
                bodyHtml: mail.bodyHtml ?? undefined,
                // Keyed on the notice *and* the class it was moved to: a genuine change of group
                // writes again, which is the only case where a family needs a second message. The
                // same-session repeat never gets this far — `place` returns before it.
                dedupeKey: `${REPLACEMENT_DEDUPE_PREFIX}${notice.id}:${replacement.id}`,
            },
            manager,
        );
    }

    /** A notice with everything the rules ask about, or a 404. */
    private async requireNotice(noticeId: number): Promise<AbsenceNotice> {
        const notice = await this.noticeRepository.findOne({
            where: { id: noticeId },
            relations: {
                child: { parent: true },
                classSession: { group: true },
                replacementSession: { group: true },
            },
        });
        if (!notice) throw new NotFoundException('Absence notice not found');
        return notice;
    }
}
