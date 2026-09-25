import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FISCAL_POLL_INTERVAL_MS } from 'src/modules/invoice/fiscal-issuing.job';
import { PaymentFiscalService } from './payment-fiscal.service';

/**
 * The clock behind the payments' side of the fiscal queue — E16/S5. Everything it knows how to do is
 * in `PaymentFiscalService`; this class only decides *when*.
 *
 * Its own timer rather than a second step in `FiscalIssuingJob`: the two queues settle on different
 * proof — the invoice series there, an invoice's paid amount here — so neither has to wait for the
 * other, and they share what they must through `SmartBillService`, which paces every call and stops
 * both at a lock-out. **One instance only**, like every scheduled job here.
 */
@Injectable()
export class PaymentFiscalJob {
    private readonly logger = new Logger('PaymentFiscal');

    private running = false;

    constructor(private readonly fiscal: PaymentFiscalService) {}

    /** **Off under `NODE_ENV=test`**: `@Interval` has no options object, so it is the first line. */
    @Interval('payment-fiscal', FISCAL_POLL_INTERVAL_MS)
    async scheduledTick(): Promise<void> {
        if (process.env.NODE_ENV === 'test') return;
        await this.tick();
    }

    async tick(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            const result = await this.fiscal.drain();
            if (result.sent > 0 || result.reconciled > 0) {
                this.logger.log(
                    `Payment pass: ${result.sent} sent (${result.recorded} recorded, ${result.refused} refused), ` +
                        `${result.reconciled} unanswered settled, ${result.review} handed to a person${result.stoppedBy ? `; stopped: ${result.stoppedBy}` : ''}.`,
                );
            }
        } catch (error: unknown) {
            this.logger.error(`Payment pass failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.running = false;
        }
    }
}
