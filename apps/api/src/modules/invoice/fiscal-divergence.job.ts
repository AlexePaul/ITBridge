import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FiscalDivergenceService } from './fiscal-divergence.service';

/** A minute: twenty reads a pass is an issued school re-read in well under a day. */
export const DIVERGENCE_POLL_INTERVAL_MS = 60_000;

/**
 * The clock behind the divergence check — E16/S8. Everything it knows is in
 * `FiscalDivergenceService`; this only decides when. **One instance only**, like every scheduled
 * job here, and off under `NODE_ENV=test`.
 */
@Injectable()
export class FiscalDivergenceJob {
    private readonly logger = new Logger('FiscalDivergence');

    private running = false;

    constructor(private readonly divergence: FiscalDivergenceService) {}

    @Interval('fiscal-divergence', DIVERGENCE_POLL_INTERVAL_MS)
    async scheduledTick(): Promise<void> {
        if (process.env.NODE_ENV === 'test') return;
        await this.tick();
    }

    async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.divergence.refresh();
        } catch (error: unknown) {
            this.logger.error(`Divergence pass failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.running = false;
        }
    }
}
