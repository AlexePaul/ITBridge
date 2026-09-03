import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DigestService } from './digest.service';

/**
 * The clock behind the digest — E17/S6. When, and nothing else; the work is in `DigestService`.
 *
 * **Five minutes, not a nightly cron.** The obvious shape would be one job at the cutoff hour, but
 * it would be wrong for the family who asked for `immediate`: their messages are held the moment
 * they are queued, and a nightly pass would sit on them all day. Ticking instead means "immediate"
 * costs a few minutes rather than a day, and the cadences that *do* wait are decided per message by
 * `releaseStampFor` rather than by when this happens to fire — so a message written at 19:00 waits
 * for tomorrow's cutoff instead of finding today's already past and going straight out, which is how
 * the one-a-day cap would have leaked.
 *
 * **Must run in exactly one instance**, like the dispatcher next to it. `FOR UPDATE SKIP LOCKED`
 * makes two passes harmless to each other — neither folds the other's rows — but two PM2 workers
 * would both wake on every tick. The pin belongs to the ecosystem file from E01/S4, which does not
 * exist yet; nothing here runs continuously until it does.
 */

/** Five minutes. The cadences are measured in days, so the tick only has to be finer than the hour. */
export const DIGEST_INTERVAL_MS = 5 * 60_000;

@Injectable()
export class DigestJob {
    private readonly logger = new Logger('Digest');

    /** The same switch the dispatcher reads: with the queue stopped, holding messages back is pointless. */
    private readonly enabled = process.env.MAIL_OUTBOX_ENABLED !== 'false';

    /** One pass at a time, so a slow pass cannot let ticks pile up behind it. */
    private running = false;

    constructor(private readonly digests: DigestService) {}

    /**
     * **Off under `NODE_ENV=test`.** `@Interval` takes no options object, so the guard is the first
     * line of the method rather than a decorator argument — the same shape `OutboxDispatcher` and
     * `LateRegisterJob` use. Without it, any suite that builds the real `AppModule` starts a timer
     * that queries the database while the module is being torn down.
     */
    @Interval('mail-digest', DIGEST_INTERVAL_MS)
    async scheduledTick(): Promise<void> {
        if (process.env.NODE_ENV === 'test') return;
        await this.tick();
    }

    async tick(): Promise<void> {
        if (!this.enabled || this.running) return;

        this.running = true;
        try {
            await this.digests.run();
        } catch (error: unknown) {
            // A failed pass is a database problem, not a delivery one: the messages are still held
            // and the next tick tries again. Nothing is lost by waiting five more minutes.
            this.logger.error(`Digest pass failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.running = false;
        }
    }
}
