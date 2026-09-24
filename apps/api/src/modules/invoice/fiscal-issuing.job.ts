import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FiscalIssuingService } from './fiscal-issuing.service';

/**
 * The clock behind the fiscal queue — E16/S2 and S3. Everything it knows how to do is in
 * `FiscalIssuingService`; this class only decides *when*, so a test can drive a pass at any hour.
 *
 * **This must run in exactly one instance**, like the outbox dispatcher. A second process would not
 * double an invoice — the claim skips locked rows and a request in the air stops every other pass —
 * but it would spend the shared rate limit on waiting. The pin is `instances: 1` and
 * `exec_mode: 'fork'` in `/srv/itbridge/ecosystem.config.js`, which is not in this repository.
 */

/** Thirty seconds, the outbox's cadence: an issued month is on its way to SmartBill within the minute. */
export const FISCAL_POLL_INTERVAL_MS = 30_000;

@Injectable()
export class FiscalIssuingJob {
    private readonly logger = new Logger('FiscalIssuing');

    /** One pass at a time. A slow SmartBill must not let ticks pile up on top of each other. */
    private running = false;

    constructor(private readonly fiscal: FiscalIssuingService) {}

    /**
     * The timer, and nothing else. **Off under `NODE_ENV=test`**, the guard every scheduled job here
     * carries: `@Interval` has no options object, so it is the first line of the method.
     */
    @Interval('fiscal-issuing', FISCAL_POLL_INTERVAL_MS)
    async scheduledTick(): Promise<void> {
        if (process.env.NODE_ENV === 'test') return;
        await this.tick();
    }

    async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const result = await this.fiscal.drain();
            // Silent when nothing happened, which is nearly every tick — and always in `off`.
            if (result.sent > 0 || result.reconciled > 0) {
                this.logger.log(
                    `Fiscal pass: ${result.sent} sent (${result.issued} issued, ${result.drafts} drafts, ${result.refused} refused), ` +
                        `${result.reconciled} unanswered settled, ${result.review} handed to a person${result.stoppedBy ? `; stopped: ${result.stoppedBy}` : ''}.`,
                );
            }
        } catch (error: unknown) {
            // A pass that throws is a database problem, not a SmartBill one: the rows are where they
            // were, and a request in the air is settled from the series on a later pass.
            this.logger.error(`Fiscal pass failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.running = false;
        }
    }
}
