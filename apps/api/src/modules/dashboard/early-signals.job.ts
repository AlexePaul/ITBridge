import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { schoolDay } from 'src/common/school-clock';
import { officeAddress } from 'src/modules/mail/office-address';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { EarlySignalsService } from './early-signals.service';
import { composeSignalsDigest, signalsDigestIsEmpty } from './signals-mail';

/**
 * The Monday message about the early signals — E21/S7's "alertă".
 *
 * A list on a tab nobody opens is a report, not an alert. So once a week, before the office starts
 * its Monday, the same four lists go to the school's address — **only when there is something on
 * them**. A message that arrives on the quiet weeks too is a message people filter, and then it is
 * not there on the week it mattered; the daily attendance reminder and the lead digest made the
 * same choice for the same reason.
 *
 * Same shape as every scheduled job here: the cron decides *when* and nothing else, the selection
 * is a plain method that takes the time, and `@Cron` never fires under `NODE_ENV=test`. One
 * instance only — two PM2 workers would both wake; `dedupeKey` turns the second into a refused
 * insert rather than a second email.
 */

/** 08:00 on Mondays, school time — before the week's first phone call. */
export const MONDAY_AT_EIGHT = '0 8 * * 1';

export const SCHOOL_TIME_ZONE = 'Europe/Bucharest';

export const SIGNALS_DIGEST_PREFIX = 'early-signals:';

export interface SignalsDigestResult {
    /** The day the signals were evaluated for. */
    asOf: string;
    /** Whether a message was written. False both when there was nothing to say and when the week's message was already queued. */
    queued: boolean;
    all: number;
}

@Injectable()
export class EarlySignalsJob {
    private readonly logger = new Logger('EarlySignals');

    constructor(
        private readonly signals: EarlySignalsService,
        private readonly outbox: OutboxService,
    ) {}

    @Cron(MONDAY_AT_EIGHT, { name: 'early-signals-digest', timeZone: SCHOOL_TIME_ZONE, disabled: process.env.NODE_ENV === 'test' })
    async runScheduled(): Promise<void> {
        try {
            await this.digestFor(new Date());
        } catch (error: unknown) {
            // A rejection out of a timer callback takes the process down, dispatcher included. Next
            // Monday asks the same question again; nothing here needs recovering.
            this.logger.error(`The early-signals digest failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async digestFor(now: Date): Promise<SignalsDigestResult> {
        const asOf = schoolDay(now);
        const signals = await this.signals.build(now);

        if (signalsDigestIsEmpty(signals)) {
            this.logger.debug(`Nothing to signal as of ${asOf}; no digest queued.`);
            return { asOf, queued: false, all: 0 };
        }

        const message = await this.outbox.queue({
            to: officeAddress(),
            ...composeSignalsDigest(signals),
            dedupeKey: `${SIGNALS_DIGEST_PREFIX}${asOf}`,
        });

        if (message === null) {
            this.logger.log(`The early-signals digest for ${asOf} was already queued; ${signals.totals.all} signal(s) not reported again.`);
            return { asOf, queued: false, all: signals.totals.all };
        }

        this.logger.log(`Queued the early-signals digest for ${asOf} with ${signals.totals.all} signal(s) as outbox message ${message.id}.`);
        return { asOf, queued: true, all: signals.totals.all };
    }
}
