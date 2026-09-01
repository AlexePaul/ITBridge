import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { OutboxService } from './outbox.service';

/**
 * The clock behind the outbox. Everything it knows how to do is in `OutboxService`; this class
 * only decides *when*, so the queue can be tested without waiting for a timer.
 *
 * **This must run in exactly one instance.** `FOR UPDATE SKIP LOCKED` makes two passes safe against
 * each other — neither sends the other's rows — but two PM2 cluster workers would still both wake
 * on every tick and both hammer the provider for nothing. The single-instance pin belongs in the
 * ecosystem file from E01/S4, **which does not exist yet**: this backend is not deployed anywhere
 * today, so the queue is built and tested here but has nowhere to run continuously until then.
 *
 * On `@nestjs/schedule`: `session.service.ts` schedules its purge on a bare `setInterval` with a
 * comment saying the package is ESM-only and jest cannot load it. That was true, and is still true
 * of the current major — v12 ships `export *` from `dist/index.js` and dies in ts-jest with
 * `SyntaxError: Unexpected token 'export'`. **v6 is CommonJS and loads**, which is why the
 * dependency is pinned to `^6.0.1` rather than to the latest. That is the obstacle E17/S3 said had
 * to be resolved rather than assumed resolved, and this is how it was resolved: by version, not by
 * jest configuration, so nothing in the test setup has to know the package exists.
 */

/**
 * Thirty seconds. E11/S2 wants a freed place notified within a minute and E12/S5 wants a class
 * cancellation out within five, so the polling gap has to be a fraction of the tighter one. It
 * costs one indexed query per tick against a table that is nearly always empty.
 */
export const POLL_INTERVAL_MS = 30_000;

@Injectable()
export class OutboxDispatcher implements OnModuleInit {
    private readonly logger = new Logger('Outbox');

    /**
     * `MAIL_OUTBOX_ENABLED=false` stops the timer from doing anything; queueing still works, so
     * messages accumulate and go out when it is turned back on. The integration suites set it,
     * because a background pass firing mid-test would move rows underneath the assertions.
     */
    private readonly enabled = process.env.MAIL_OUTBOX_ENABLED !== 'false';

    /** One pass at a time. A slow provider must not let ticks pile up on top of each other. */
    private running = false;

    constructor(private readonly outbox: OutboxService) {}

    onModuleInit(): void {
        if (!this.enabled) {
            this.logger.log('Dispatcher disabled by MAIL_OUTBOX_ENABLED=false; queued mail will stay queued.');
        }
    }

    /**
     * The timer, and nothing else — `tick` is the work, exactly as every `@Cron` here keeps its
     * selection in a plain method.
     *
     * **Off under `NODE_ENV=test`.** Jest sets that variable, and the unit config has no
     * `setupFiles`, so `MAIL_OUTBOX_ENABLED=false` — which the e2e setup does set — never reaches a
     * unit run. Any suite that builds the real `AppModule`, and the authorization matrix does,
     * therefore started a timer that queried the database every few seconds and went on doing it
     * while the module was being torn down; the symptom was one suite failing with `connection
     * terminated` and passing on the re-run. Every `@Cron` in the codebase already carries this
     * guard. The interval was the one job that did not.
     *
     * The guard is here rather than on `enabled` so `tick` stays callable — its own spec drives it
     * directly, which is the point of splitting when from what.
     */
    @Interval('outbox-dispatch', POLL_INTERVAL_MS)
    async scheduledTick(): Promise<void> {
        if (process.env.NODE_ENV === 'test') return;
        await this.tick();
    }

    async tick(): Promise<void> {
        if (!this.enabled || this.running) {
            return;
        }

        this.running = true;
        try {
            const result = await this.outbox.dispatchPending();
            // Silent when there was nothing to do, which is most ticks. A line every thirty seconds
            // saying "nothing happened" is how a log stops being read.
            if (result.claimed > 0) {
                this.logger.log(`Dispatched ${result.claimed} message(s): ${result.sent} sent, ${result.failed} failed.`);
            }
        } catch (error: unknown) {
            // A pass that throws is a database problem, not a delivery problem — the messages are
            // still on the table and the next tick tries again.
            this.logger.error(`Outbox pass failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.running = false;
        }
    }
}
