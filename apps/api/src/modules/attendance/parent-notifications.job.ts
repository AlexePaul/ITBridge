import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { absencesUrl } from 'src/modules/auth/portal-urls';
import { addDays, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { romanianDate } from 'src/modules/mail/romanian-date';
import { SCHOOL_TIME_ZONE } from './absence-notice.rules';

/**
 * What E12/S7 writes to a parent — the second line, after the teacher's phone call.
 *
 * **One message, and it is about a make-up rather than about an absence.** There *was* a same-day
 * "your child was not at class" message here, and it was removed: see the note on
 * `notifyCreditsEarned` for the three ways a register that is forgotten, late or mistyped made it
 * unreliable when it was harmless and alarming when it was not. There was also a second message,
 * warning that a credit was about to lapse; it went with the thirty-day window — see the note where
 * it used to be.
 *
 * It is **transactional**: a family being told about a right they hold is the school performing its
 * side. It does not consult `marketingOptIn` (E17/S4), and that is not an oversight —
 * `OutboxService.queueOrRecord` takes no preference at all, so there is no argument this job could
 * pass that would suppress it.
 *
 * **The selection is a plain method.** The cron decides only *when*, exactly as
 * `unmarked-attendance.job.ts` and `OutboxDispatcher` do — so every case can be tested against any
 * date without a clock, which matters more here than usual, because the question is about "today".
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

export const EARNED_DEDUPE_PREFIX = 'make-up-earned:';

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
     * not know — that the hour is owed, and until when. A mistyped register cannot produce
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

    /*
     * `remindExpiring` used to live here, and it is gone rather than shortened — E12/S4.
     *
     * It warned a family seven days before a thirty-day credit lapsed, so they could go and book an
     * hour. Both halves of that are now false: the window is the week the class was missed in, which
     * cannot be announced a week ahead, and the family does not book anything — the office moves the
     * child. A reminder addressed to somebody who has nothing to press is worse than none.
     *
     * What replaces it is an office-facing question, not a family-facing one: which of this week's
     * announced absences has nobody placed yet? That has no screen and no recipient list, so it is
     * not smuggled in here — see the open questions in E12.
     */

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
