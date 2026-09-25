import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { SmartBillService } from 'src/modules/smartbill/smartbill.service';
import { missingSmartBillSettings, smartBillConfig, type SmartBillMode } from 'src/modules/smartbill/smartbill.config';
import { SmartBillError } from 'src/modules/smartbill/smartbill.rules';
import { DIVERGENCE_BATCH_SIZE, DIVERGENCE_CHECK_EVERY_MS, divergenceOf, type DivergenceReason } from './fiscal-divergence.rules';

export interface FiscalDivergenceRow {
    invoiceId: number;
    monthIssued: string;
    familyName: string;
    fiscalSeries: string | null;
    fiscalNumber: string | null;
    /** The platform's invoice total. */
    amount: number;
    /** SmartBill's total as last read; `null` when SmartBill no longer knows the number. */
    smartbillTotal: number | null;
    /** Money the platform counts as received. */
    platformPaid: number;
    /** What the platform recorded in SmartBill. */
    recordedPaid: number;
    /** What SmartBill counted as collected when it was last read. */
    smartbillPaid: number | null;
    checkedAt: string;
    reasons: DivergenceReason[];
}

export interface FiscalDivergenceReport {
    mode: SmartBillMode;
    /** Settings the check cannot read without. Always empty outside `live`, where nothing is read. */
    missing: string[];
    lockedUntil: string | null;
    /** Invoices SmartBill numbered; `unchecked` of them have not been read since their last change. */
    issued: number;
    unchecked: number;
    /** The oldest read among the checked ones — how stale the report can be, at worst. */
    oldestCheckAt: string | null;
    rows: FiscalDivergenceRow[];
}

export interface DivergenceRefreshResult {
    checked: number;
    stoppedBy: 'off' | 'configuration' | 'throttled' | 'unanswered' | null;
}

/**
 * The divergence half of E16/S8: reads SmartBill's side of every issued invoice, a day apart, and
 * reports where it disagrees with the platform — "divergențele dintre sisteme apar într-un raport,
 * nu într-o surpriză la finalul lunii".
 *
 * **Only SmartBill's side is stored**, on the invoice (`fiscalPaidAmount`, `fiscalTotalAmount`,
 * `fiscalCheckedAt`); the verdict is `divergenceOf`, computed when the report is read, against the
 * payments as they stand then. The same judgement the queues made about their own state: a stored
 * answer is a second answer, and it is wrong exactly as long as nobody recomputed it.
 *
 * Reads only, and only in `live`: `off` promises nothing leaves the platform, and `draft` has no
 * numbered invoices to read.
 */
@Injectable()
export class FiscalDivergenceService {
    private readonly logger = new Logger('FiscalDivergence');

    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        private readonly smartBill: SmartBillService,
    ) {}

    /** One pass: read the invoices due a check, oldest read first, never-read before all. */
    async refresh(options: { now?: Date; batchSize?: number } = {}): Promise<DivergenceRefreshResult> {
        const now = options.now ?? new Date();
        const config = smartBillConfig();
        if (config.mode !== 'live') return { checked: 0, stoppedBy: 'off' };
        if (missingSmartBillSettings(config).length > 0) return { checked: 0, stoppedBy: 'configuration' };
        if (this.smartBill.lockedOutUntil(now)) return { checked: 0, stoppedBy: 'throttled' };

        const due = await this.invoiceRepository
            .createQueryBuilder('invoice')
            .andWhere('invoice.fiscalStatus = :issued', { issued: InvoiceFiscalStatus.ISSUED })
            .andWhere('(invoice.fiscalCheckedAt IS NULL OR invoice.fiscalCheckedAt <= :before)', {
                before: new Date(now.getTime() - DIVERGENCE_CHECK_EVERY_MS),
            })
            .orderBy('invoice.fiscalCheckedAt', 'ASC', 'NULLS FIRST')
            .addOrderBy('invoice.id', 'ASC')
            .limit(options.batchSize ?? DIVERGENCE_BATCH_SIZE)
            .getMany();

        let checked = 0;
        for (const invoice of due) {
            try {
                const status = await this.smartBill.invoicePaymentStatus(invoice.fiscalSeries ?? '', invoice.fiscalNumber ?? '');
                await this.invoiceRepository.update(invoice.id, { fiscalPaidAmount: status.paid, fiscalTotalAmount: status.total, fiscalCheckedAt: now });
            } catch (error: unknown) {
                if (error instanceof SmartBillError && error.kind === 'refused') {
                    // "Factura nu a fost gasita": read, and the answer is that it is gone.
                    await this.invoiceRepository.update(invoice.id, { fiscalPaidAmount: null, fiscalTotalAmount: null, fiscalCheckedAt: now });
                } else {
                    const stoppedBy =
                        error instanceof SmartBillError && error.kind === 'throttled'
                            ? 'throttled'
                            : error instanceof SmartBillError && error.kind === 'configuration'
                              ? 'configuration'
                              : 'unanswered';
                    this.logger.warn(`Divergence check paused (${stoppedBy}): ${error instanceof Error ? error.message : String(error)}`);
                    return { checked, stoppedBy };
                }
            }
            checked++;
        }
        return { checked, stoppedBy: null };
    }

    /**
     * "Verifică acum": every issued invoice becomes due, and the passes read them over the next
     * minutes at the pace every other call keeps. Nothing is read in the request itself — a month
     * of invoices is minutes of calls, and an admin must not wait on them.
     */
    async markAllDue(): Promise<{ due: number }> {
        const result = await this.invoiceRepository
            .createQueryBuilder()
            .update(Invoice)
            .set({ fiscalCheckedAt: null })
            .andWhere('"fiscalStatus" = :issued', { issued: InvoiceFiscalStatus.ISSUED })
            .execute();
        return { due: result.affected ?? 0 };
    }

    async report(now: Date = new Date()): Promise<FiscalDivergenceReport> {
        const config = smartBillConfig();

        const issued = await this.invoiceRepository.count({ where: { fiscalStatus: InvoiceFiscalStatus.ISSUED } });
        const checkedInvoices = await this.invoiceRepository
            .createQueryBuilder('invoice')
            .leftJoinAndSelect('invoice.parent', 'parent')
            .leftJoinAndSelect('invoice.payments', 'payment')
            .andWhere('invoice.fiscalStatus = :issued', { issued: InvoiceFiscalStatus.ISSUED })
            .andWhere('invoice.fiscalCheckedAt IS NOT NULL')
            .orderBy('invoice.monthIssued', 'DESC')
            .addOrderBy('invoice.id', 'ASC')
            .getMany();

        const rows: FiscalDivergenceRow[] = [];
        let oldest: Date | null = null;
        for (const invoice of checkedInvoices) {
            const checkedAt = invoice.fiscalCheckedAt as Date;
            if (!oldest || checkedAt < oldest) oldest = checkedAt;
            const divergence = divergenceOf({
                amount: invoice.amount,
                smartbill: { checked: true, total: invoice.fiscalTotalAmount, paid: invoice.fiscalPaidAmount },
                payments: invoice.payments ?? [],
            });
            if (divergence.reasons.length === 0) continue;
            rows.push({
                invoiceId: invoice.id,
                monthIssued: invoice.monthIssued,
                familyName: `${invoice.parent?.lastName ?? ''} ${invoice.parent?.firstName ?? ''}`.trim(),
                fiscalSeries: invoice.fiscalSeries,
                fiscalNumber: invoice.fiscalNumber,
                amount: invoice.amount,
                smartbillTotal: invoice.fiscalTotalAmount,
                platformPaid: divergence.platformPaid,
                recordedPaid: divergence.recordedPaid,
                smartbillPaid: invoice.fiscalPaidAmount,
                checkedAt: checkedAt.toISOString(),
                reasons: divergence.reasons,
            });
        }

        return {
            mode: config.mode,
            missing: config.mode === 'live' ? missingSmartBillSettings(config) : [],
            lockedUntil: this.smartBill.lockedOutUntil(now)?.toISOString() ?? null,
            issued,
            unchecked: issued - checkedInvoices.length,
            oldestCheckAt: oldest?.toISOString() ?? null,
            rows,
        };
    }
}
