import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { ArrearsService } from './arrears.service';
import { daysUntilDue } from './arrears.rules';
import { formatLeiRo, romanianMonth, romanianDay } from './money-words';

/**
 * The arrears calendar — E16/S7.
 *
 * Three days before the term, then every seven days after it, and nothing in between. The gaps are
 * the point: a family written to daily stops reading, and then the message that mattered is the one
 * they had already learned to skip.
 *
 * **Nothing here decides whether a family still owes.** `ArrearsService.list` answers that, and it
 * answers it from succeeded payments rather than from a status column — so a payment recorded at
 * four in the afternoon takes the family off tomorrow's run without anybody cancelling anything.
 * That is the acceptance criterion "memento-urile se opresc imediat la încasare", expressed as the
 * absence of a row rather than as a rule somebody has to remember to apply.
 *
 * **The selection is a plain method**, as in every other job here; the cron decides only the hour.
 *
 * **Must run in exactly one instance.** Two would compose the same message twice, and the dedupe
 * key makes the second a refused insert rather than a second email.
 */

/** 09:00 school time. Early enough to be read, late enough not to arrive overnight. */
export const MORNING_AT_NINE = '0 9 * * *';
export const SCHOOL_TIME_ZONE = 'Europe/Bucharest';

/** How many days before the term the first, friendly reminder goes out. */
export const NOTICE_DAYS_BEFORE = 3;

/** How often afterwards. Weekly: often enough not to be forgotten, rare enough to still be read. */
export const REMINDER_INTERVAL_DAYS = 7;

/**
 * After this many days the platform stops writing and the matter becomes a conversation.
 *
 * Sixty days of unanswered email is not a message problem, and the eleventh identical reminder
 * persuades nobody — it only teaches the family that this sender can be ignored. The row stays on
 * the arrears screen, where somebody can pick up the phone.
 */
export const STOP_WRITING_AFTER_DAYS = 60;

export const DEDUPE_PREFIX = 'arrears:';

export interface ArrearsRunResult {
    date: string;
    /** How many invoices moved into `overdue` on this run. */
    markedOverdue: number;
    /** How many families were written to. */
    notified: number;
}

@Injectable()
export class ArrearsJob {
    private readonly logger = new Logger('ArrearsJob');
    private readonly office = officeAddress();

    constructor(
        private readonly arrears: ArrearsService,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
    ) {}

    @Cron(MORNING_AT_NINE, { timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async run(): Promise<void> {
        await this.runFor(this.today());
    }

    async runFor(day: Date): Promise<ArrearsRunResult> {
        const markedOverdue = await this.arrears.markOverdue(day);
        const rows = await this.arrears.list(day);

        let notified = 0;
        for (const row of rows) {
            const until = daysUntilDue(row.dateIssued, day);
            const kind = this.dueToday(until, row.daysOverdue);
            if (!kind) continue;

            const mail = await this.mailTemplates.render(kind === 'notice' ? 'payment-due-soon' : 'payment-overdue', {
                firstName: row.parentName.split(' ')[0] ?? row.parentName,
                month: romanianMonth(row.monthIssued),
                // The outstanding amount, not the invoice total: a family who has paid half is
                // owed a number they recognise, and being asked for the whole of it again reads as
                // "you were not credited".
                amount: formatLeiRo(row.outstanding),
                dueOn: romanianDay(row.dueOn),
                officeEmail: this.office,
            });

            const queued = await this.outbox.queueOrRecord(
                { email: row.email },
                {
                    subject: mail.subject,
                    bodyText: mail.bodyText,
                    bodyHtml: mail.bodyHtml ?? undefined,
                    // Per invoice per day: a re-run writes nothing new, and two invoices of the
                    // same family are two separate matters.
                    dedupeKey: `${DEDUPE_PREFIX}${row.invoiceId}:${toIsoDate(day)}`,
                },
            );
            if (queued) notified += 1;
        }

        this.logger.log(`Arrears on ${toIsoDate(day)}: ${markedOverdue} newly overdue, wrote to ${notified} family(ies).`);
        return { date: toIsoDate(day), markedOverdue, notified };
    }

    /**
     * Whether today is a day this invoice gets written about, and in which tone.
     *
     * Exactly on the schedule, never "within": a range would write every day, which is the failure
     * this calendar exists to avoid.
     */
    private dueToday(daysUntil: number, overdue: number): 'notice' | 'reminder' | null {
        if (daysUntil === NOTICE_DAYS_BEFORE) return 'notice';
        if (overdue <= 0) return null;
        if (overdue > STOP_WRITING_AFTER_DAYS) return null;
        // On the day the term ran out, and weekly from there.
        return overdue % REMINDER_INTERVAL_DAYS === 0 ? 'reminder' : null;
    }

    /** Today on the school's clock — a host in another zone would otherwise ask about another day. */
    private today(): Date {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
            new Date(),
        );
        const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
        return new Date(get('year'), get('month') - 1, get('day'));
    }
}
