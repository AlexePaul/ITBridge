import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { absencesUrl } from 'src/modules/auth/portal-urls';
import { addDays, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { SCHOOL_TIME_ZONE } from './absence-notice.rules';

/**
 * What E12/S7 writes to a parent — the second line, after the teacher's phone call.
 *
 * **Both messages are about a make-up, and neither is about an absence.** There *was* a same-day
 * "your child was not at class" message here, and it was removed: see the note on
 * `notifyCreditsEarned` for the three ways a register that is forgotten, late or mistyped made it
 * unreliable when it was harmless and alarming when it was not.
 *
 * Both are **transactional**: a family being told about a right they hold, and about that right
 * lapsing, is the school performing its side. Neither consults `marketingOptIn` (E17/S4), and that
 * is not an oversight — `OutboxService.queueOrRecord` takes no preference at all, so there is no
 * argument this job could pass that would suppress them.
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

/**
 * 19:00 school time — after the last class of the day.
 *
 * Late enough that a register taken during the afternoon is in, and that a teacher who mistyped has
 * had the rest of the day to notice. Nothing here is urgent: a make-up earned at four o'clock is
 * worth exactly as much at seven.
 */
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

export const EARNED_DEDUPE_PREFIX = 'make-up-earned:';
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
        @InjectRepository(MakeUpCredit) private readonly creditRepository: Repository<MakeUpCredit>,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
    ) {}

    @Cron(EVENING_AT_SEVEN, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async runEarnedNotices(): Promise<void> {
        await this.notifyCreditsEarned(this.today());
    }

    @Cron(MORNING_AT_NINE, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async runExpiryReminders(): Promise<void> {
        await this.remindExpiring(this.today());
    }

    /**
     * Tells a family they have earned a make-up.
     *
     * **This replaced a same-day "your child was not at class" message, and the reason is worth
     * keeping.** That message read `Attendance.present = false`, and a register is exactly the
     * thing a teacher forgets, takes late, or mistypes:
     *
     * - **forgotten** — no rows, so nothing was sent: silent in the case it was for, which the
     *   10:00 unmarked-attendance reminder already covers better;
     * - **taken late** — the evening run for that day had already passed, and nothing re-runs a
     *   past day, so the family was never told at all;
     * - **mistyped** — the message went out, and correcting the mark half an hour later did not
     *   un-send it. A parent had already read that their child was missing from a class.
     *
     * The costs are not symmetric: a notification that does not arrive costs little, because the
     * urgent case is the teacher's phone call from the register screen (S6) and it happens while
     * the class is still on. A notification that arrives wrongly costs a frightened family.
     *
     * A credit, by contrast, **cannot alarm anybody**: it is earned only where a family announced in
     * time, so they already know the child was away, and what this tells them is the part they do
     * not know — that they have an hour to book, and by when. A mistyped register cannot produce
     * one either, because the child whose mark was wrong is not a child whose family announced.
     *
     * Selected by the day the credit was **created**, not by the class it came from, so a register
     * taken two days late still reaches the family on the evening it is taken.
     */
    async notifyCreditsEarned(day: Date): Promise<NotificationRunResult> {
        const date = toIsoDate(day);
        const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const dayEnd = addDays(dayStart, 1);

        const earned = await this.creditRepository.find({
            where: { createdAt: Between(dayStart, dayEnd) },
            relations: { child: { parent: true }, originSession: { group: true } },
        });
        if (earned.length === 0) {
            return { date, notified: 0 };
        }

        // One message per parent, as everywhere else: a family with two children who both earned
        // one gets a single note, not two.
        const byParent = new Map<number, { email: string | null; firstName: string; lines: string[] }>();
        for (const credit of earned) {
            const parent = credit.child.parent;
            if (!parent) continue;

            const entry = byParent.get(parent.id) ?? { email: parent.email ?? null, firstName: parent.firstName, lines: [] };
            entry.lines.push(`· ${credit.child.firstName} — de folosit până pe ${romanianDate(credit.expiresOn)}`);
            byParent.set(parent.id, entry);
        }

        let notified = 0;
        for (const [parentId, entry] of byParent) {
            const mail = await this.mailTemplates.render('make-up-earned', {
                firstName: entry.firstName,
                credits: entry.lines.join('\n'),
                portalUrl: absencesUrl(),
            });
            const queued = await this.outbox.queueOrRecord(
                { email: entry.email },
                {
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? undefined,
                    dedupeKey: `${EARNED_DEDUPE_PREFIX}${date}:${parentId}`,
                },
            );
            if (queued) notified += 1;
        }

        this.logger.log(`Make-up credits earned on ${date}: wrote to ${notified} parent(s).`);
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
