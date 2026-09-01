import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { absencesUrl } from 'src/modules/auth/portal-urls';
import { addDays, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { SCHOOL_TIME_ZONE } from './absence-notice.rules';

/**
 * The two things E12/S7 promises a parent — the second line, after the teacher's phone call.
 *
 * Both are **transactional**: a family being told their child was not at a class they paid for, and
 * being told a right they hold is about to lapse, are the school performing its side. Neither
 * consults `marketingOptIn` (E17/S4), and that is not an oversight — `OutboxService.queueOrRecord`
 * takes no preference at all, so there is no argument this job could pass that would suppress them.
 *
 * **The selection is a plain method in both cases.** The cron decides only *when*, exactly as
 * `unmarked-attendance.job.ts` and `OutboxDispatcher` do — so every case can be tested against any
 * date without a clock, which matters more here than usual, because both questions are about "today"
 * and "soon".
 *
 * **Must run in exactly one instance**, like every other job here. Two workers would compose the
 * same message twice; the `dedupeKey` makes the second a refused insert rather than a second email,
 * so the failure mode is a wasted query. The single-instance pin belongs to the deploy story.
 */

/** 19:00 school time — after the last class, and still the same day the family is told about. */
export const EVENING_AT_SEVEN = '0 19 * * *';

/** 09:00 school time, so a reminder about a lapsing right arrives at the start of a usable day. */
export const MORNING_AT_NINE = '0 9 * * *';

/**
 * How long before a credit lapses the family is told.
 *
 * Seven days, so the reminder contains at least one of the child's own weekly classes to book
 * around, and is far enough out that "we could not find a slot" is still solvable. A day or two
 * would be a notice of death rather than a reminder.
 */
export const EXPIRY_WARNING_DAYS = 7;

export const ABSENCE_DEDUPE_PREFIX = 'absence-noticed:';
export const EXPIRY_DEDUPE_PREFIX = 'make-up-expiring:';

/** Romanian short dates, for a sentence a parent reads rather than a column. */
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

export function romanianDate(date: Date | string): string {
    const iso = toIsoDate(date);
    const [, month, day] = iso.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''}`;
}

export interface NotificationRunResult {
    /** The day the run is about, `YYYY-MM-DD`. */
    date: string;
    /** How many parents were written to. One message per parent, never one per child. */
    notified: number;
}

@Injectable()
export class ParentNotificationsJob {
    private readonly logger = new Logger('ParentNotifications');
    private readonly office = officeAddress();

    constructor(
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(AbsenceNotice) private readonly noticeRepository: Repository<AbsenceNotice>,
        @InjectRepository(MakeUpCredit) private readonly creditRepository: Repository<MakeUpCredit>,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
    ) {}

    @Cron(EVENING_AT_SEVEN, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async runAbsenceNotices(): Promise<void> {
        await this.notifyAbsences(this.today());
    }

    @Cron(MORNING_AT_NINE, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async runExpiryReminders(): Promise<void> {
        await this.remindExpiring(this.today());
    }

    /**
     * Tells a family their child was not at a class **nobody announced**.
     *
     * An announced absence is not written about: the family already told the school, and a message
     * back saying what they themselves said is the kind of noise that teaches people to filter the
     * sender. That is the same reasoning that keeps the daily unmarked reminder silent on good days.
     *
     * One message per parent, listing all their children's absences that day — a family with two
     * children gets one email, which is the rule E14 established for exactly this reason.
     */
    async notifyAbsences(day: Date): Promise<NotificationRunResult> {
        const date = toIsoDate(day);

        const absences = await this.attendanceRepository.find({
            where: { present: false, classSession: { date: day } },
            relations: { child: { parent: true }, classSession: { group: true } },
        });

        if (absences.length === 0) {
            return { date, notified: 0 };
        }

        // Announced ones are dropped here rather than in the query: the notice lives in another
        // table with no relation to `Attendance`, and one lookup for the day beats one per row.
        const announced = await this.noticeRepository.find({
            where: { classSession: { id: In(absences.map((absence) => absence.classSession.id)) } },
            relations: { child: true, classSession: true },
        });
        const announcedKeys = new Set(announced.map((notice) => `${notice.child.id}:${notice.classSession.id}`));

        const byParent = new Map<number, { email: string | null; firstName: string; lines: string[] }>();
        for (const absence of absences) {
            if (announcedKeys.has(`${absence.child.id}:${absence.classSession.id}`)) continue;
            const parent = absence.child.parent;
            if (!parent) continue;

            const entry = byParent.get(parent.id) ?? { email: parent.email ?? null, firstName: parent.firstName, lines: [] };
            entry.lines.push(
                `· ${absence.child.firstName} — ${absence.classSession.group?.name ?? 'grupa lui'}, ${absence.classSession.startTime.slice(0, 5)}`,
            );
            byParent.set(parent.id, entry);
        }

        let notified = 0;
        for (const [parentId, entry] of byParent) {
            const mail = await this.mailTemplates.render('absence-noticed', {
                firstName: entry.firstName,
                absences: entry.lines.join('\n'),
                officeEmail: this.office,
            });
            const queued = await this.outbox.queueOrRecord(
                { email: entry.email },
                {
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? undefined,
                    // Per parent per day: a re-run at 19:05 does not write twice, and a family with
                    // two absent children still gets one message.
                    dedupeKey: `${ABSENCE_DEDUPE_PREFIX}${date}:${parentId}`,
                },
            );
            if (queued) notified += 1;
        }

        this.logger.log(`Absences on ${date}: wrote to ${notified} parent(s).`);
        return { date, notified };
    }

    /**
     * Reminds a family that an unused make-up is about to lapse.
     *
     * Only credits that are **neither booked nor spent**: a family who has already chosen an hour
     * needs no nudge, and one who used it needs no reminder about a right they no longer hold.
     * Exactly `EXPIRY_WARNING_DAYS` out, not "within" — a range would write on every one of the
     * seven days, which is how a helpful reminder becomes a nuisance.
     */
    async remindExpiring(day: Date): Promise<NotificationRunResult> {
        const target = addDays(day, EXPIRY_WARNING_DAYS);
        const date = toIsoDate(day);

        const expiring = await this.creditRepository.find({
            where: {
                expiresOn: target,
                bookedSession: IsNull(),
                consumedAttendance: IsNull(),
            },
            relations: { child: { parent: true } },
        });

        let notified = 0;
        for (const credit of expiring) {
            const parent = credit.child.parent;
            if (!parent) continue;

            const mail = await this.mailTemplates.render('make-up-expiring', {
                firstName: parent.firstName,
                childName: credit.child.firstName,
                expiresOn: romanianDate(credit.expiresOn),
                portalUrl: absencesUrl(),
            });
            const queued = await this.outbox.queueOrRecord(
                { email: parent.email ?? null },
                {
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? undefined,
                    // Per credit: the reminder goes out once, whatever else runs.
                    dedupeKey: `${EXPIRY_DEDUPE_PREFIX}${credit.id}`,
                },
            );
            if (queued) notified += 1;
        }

        this.logger.log(`Make-up credits lapsing on ${toIsoDate(target)}: wrote to ${notified} parent(s).`);
        return { date, notified };
    }

    /**
     * Today, on the school's clock rather than the host's.
     *
     * A server in another zone would otherwise ask about the wrong day — the same off-by-one the
     * unmarked-attendance job pins, and the reason both read the date through `Intl`.
     */
    private today(): Date {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
            new Date(),
        );
        const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
        return new Date(get('year'), get('month') - 1, get('day'));
    }
}
