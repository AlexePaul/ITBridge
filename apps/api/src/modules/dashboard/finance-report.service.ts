import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { ArrearsBucket } from 'src/modules/invoice/arrears.rules';
import { roundToBani } from 'src/modules/invoice/pricing';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { billingMonthOf, firstDayOf, lastDayOf, monthsBetween } from './reports.rules';

/** Money received, split by how it arrived. */
export interface CollectedByMethod {
    cash: number;
    bankTransfer: number;
}

/** One billing month of the finance report. Zeros are real rows: a month with no invoices is a month with no invoices. */
export interface FinanceMonth {
    /** `YYYY-MM`. */
    month: string;
    /** Amounts on the month's billable invoices — `waived` rows are not money and are not in here. */
    invoiced: number;
    /** Billable invoices issued for the month. */
    invoices: number;
    /** Months settled at zero. Counted, not summed: there is nothing to sum. */
    waived: number;
    /** Distinct families billed for the month. */
    families: number;
    /** Succeeded payments **against this month's invoices**, whenever they arrived. The gap to `invoiced` is what the month still owes. */
    collectedForMonth: number;
    /** `invoiced` minus what has been received against it, floored per invoice at zero. */
    outstanding: number;
    /** Succeeded payments **dated inside this calendar month**, whichever month they pay for. What the bank saw. */
    collectedInMonth: number;
    /** The split of `collectedInMonth`. */
    byMethod: CollectedByMethod;
    /** `invoiced` over `families`, or 0 when nobody was billed. */
    averagePerFamily: number;
}

/** What the ageing screen says right now, folded into the report so the money page needs one call. */
export interface FinanceArrears {
    families: number;
    outstanding: number;
    byBucket: Record<ArrearsBucket, { invoices: number; outstanding: number }>;
}

/** What the numbers were computed from, so a reader can judge how complete they are. */
export interface FinanceBasis {
    billableInvoices: number;
    waivedInvoices: number;
    succeededPayments: number;
    /** Announced transfers that have not landed. Not counted anywhere above, on purpose. */
    initiatedPayments: number;
    /** Money that came and went back. Not counted anywhere above. */
    reversedPayments: number;
    failedPayments: number;
}

export interface FinanceReport {
    from: string;
    to: string;
    /** The day the report was computed, `YYYY-MM-DD`. Arrears age against it. */
    generatedOn: string;
    months: FinanceMonth[];
    totals: {
        invoiced: number;
        invoices: number;
        waived: number;
        /** Distinct across the whole range — a family billed every month is one family. */
        families: number;
        collectedForMonth: number;
        outstanding: number;
        collectedInMonth: number;
        byMethod: CollectedByMethod;
        averagePerFamily: number;
    };
    arrears: FinanceArrears;
    basis: FinanceBasis;
}

const EMPTY_BUCKETS = (): Record<ArrearsBucket, { invoices: number; outstanding: number }> => ({
    due_soon: { invoices: 0, outstanding: 0 },
    overdue: { invoices: 0, outstanding: 0 },
    over_30: { invoices: 0, outstanding: 0 },
    over_60: { invoices: 0, outstanding: 0 },
});

/**
 * Invoiced against collected, month by month — E21/S2.
 *
 * **Two calendars, both shown, neither hidden inside the other.** "Collected for March" is every
 * succeeded payment against a March invoice, whenever it arrived; the gap to what was invoiced is
 * what March still owes. "Collected in March" is every succeeded payment dated in March, whichever
 * month it pays for; that is the figure the bank statement and the accountant have. The two differ
 * whenever a family pays late, which is exactly when a money report is worth reading, so a report
 * that picked one and called it "collected" would be right on quiet months and wrong on the others.
 *
 * **Only `succeeded` payments are money.** An announced transfer, a failed one and a reversed one
 * are kept as rows because the attempt is part of the story, and reported in `basis` because a
 * reader deserves to know they exist — but none of them pays anything down, here or in
 * `PaymentService.recomputeInvoiceStatus`, which is the one definition this report defers to.
 *
 * **Not by location, and not by module.** An invoice belongs to a family and a family may have
 * children at both addresses — the same reason arrears are not grouped by location. Modules are
 * E10, out of MVP. Neither axis is derivable from the rows that exist, and inventing one would be
 * the kind of report the epic warns about: built on data that is not there.
 *
 * Ageing is asked of `ArrearsService`, not re-derived: one definition of "late".
 */
@Injectable()
export class FinanceReportService {
    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
        private readonly arrears: ArrearsService,
    ) {}

    async build(from: string, to: string, today: Date = new Date()): Promise<FinanceReport> {
        const months = monthsBetween(from, to);
        const byMonth = new Map<string, FinanceMonth>(months.map((month) => [month, emptyMonth(month)]));

        const [invoices, paymentsInRange, arrearsRows, statusCounts] = await Promise.all([
            this.invoicesIssuedFor(from, to),
            this.succeededPaymentsDated(firstDayOf(from), lastDayOf(to)),
            this.arrears.list(today),
            this.paymentCountsByStatus(firstDayOf(from), lastDayOf(to)),
        ]);

        const paidByInvoice = await this.paidPerInvoice(invoices.map((invoice) => invoice.id));

        const familiesByMonth = new Map<string, Set<number>>();
        const familiesInRange = new Set<number>();
        let billable = 0;
        let waived = 0;

        for (const invoice of invoices) {
            const row = byMonth.get(invoice.monthIssued);
            if (!row) continue;
            if (invoice.status === InvoiceStatus.WAIVED) {
                row.waived += 1;
                waived += 1;
                continue;
            }
            billable += 1;
            const paid = paidByInvoice.get(invoice.id) ?? 0;
            row.invoiced += invoice.amount;
            row.invoices += 1;
            row.collectedForMonth += paid;
            row.outstanding += Math.max(0, invoice.amount - paid);
            const parentId = invoice.parent.id;
            familiesInRange.add(parentId);
            if (!familiesByMonth.has(invoice.monthIssued)) familiesByMonth.set(invoice.monthIssued, new Set());
            familiesByMonth.get(invoice.monthIssued)!.add(parentId);
        }

        for (const payment of paymentsInRange) {
            const row = byMonth.get(billingMonthOf(toIsoDate(payment.date)));
            if (!row) continue;
            row.collectedInMonth += payment.amount;
            if (payment.method === PaymentMethod.BANK_TRANSFER) row.byMethod.bankTransfer += payment.amount;
            else row.byMethod.cash += payment.amount;
        }

        const rows = months.map((month) => {
            const row = byMonth.get(month)!;
            row.families = familiesByMonth.get(month)?.size ?? 0;
            return finish(row);
        });

        const totals = rows.reduce(
            (sum, row) => ({
                invoiced: sum.invoiced + row.invoiced,
                invoices: sum.invoices + row.invoices,
                waived: sum.waived + row.waived,
                collectedForMonth: sum.collectedForMonth + row.collectedForMonth,
                outstanding: sum.outstanding + row.outstanding,
                collectedInMonth: sum.collectedInMonth + row.collectedInMonth,
                byMethod: { cash: sum.byMethod.cash + row.byMethod.cash, bankTransfer: sum.byMethod.bankTransfer + row.byMethod.bankTransfer },
            }),
            { invoiced: 0, invoices: 0, waived: 0, collectedForMonth: 0, outstanding: 0, collectedInMonth: 0, byMethod: { cash: 0, bankTransfer: 0 } },
        );

        const arrearsByBucket = EMPTY_BUCKETS();
        for (const row of arrearsRows) {
            arrearsByBucket[row.bucket].invoices += 1;
            arrearsByBucket[row.bucket].outstanding = roundToBani(arrearsByBucket[row.bucket].outstanding + row.outstanding);
        }

        return {
            from,
            to,
            generatedOn: toIsoDate(today),
            months: rows,
            totals: {
                invoiced: roundToBani(totals.invoiced),
                invoices: totals.invoices,
                waived: totals.waived,
                families: familiesInRange.size,
                collectedForMonth: roundToBani(totals.collectedForMonth),
                outstanding: roundToBani(totals.outstanding),
                collectedInMonth: roundToBani(totals.collectedInMonth),
                byMethod: { cash: roundToBani(totals.byMethod.cash), bankTransfer: roundToBani(totals.byMethod.bankTransfer) },
                averagePerFamily: familiesInRange.size === 0 ? 0 : roundToBani(totals.invoiced / familiesInRange.size),
            },
            arrears: {
                families: new Set(arrearsRows.map((row) => row.parentId)).size,
                outstanding: roundToBani(arrearsRows.reduce((sum, row) => sum + row.outstanding, 0)),
                byBucket: arrearsByBucket,
            },
            basis: {
                billableInvoices: billable,
                waivedInvoices: waived,
                succeededPayments: statusCounts.get(PaymentStatus.SUCCEEDED) ?? 0,
                initiatedPayments: statusCounts.get(PaymentStatus.INITIATED) ?? 0,
                reversedPayments: statusCounts.get(PaymentStatus.REVERSED) ?? 0,
                failedPayments: statusCounts.get(PaymentStatus.FAILED) ?? 0,
            },
        };
    }

    /** Every invoice whose billing month is in the range, with just enough of the parent to count families. */
    private invoicesIssuedFor(from: string, to: string): Promise<Invoice[]> {
        return this.invoiceRepository
            .createQueryBuilder('invoice')
            .leftJoin('invoice.parent', 'parent')
            .addSelect(['parent.id'])
            .andWhere('invoice.monthIssued BETWEEN :from AND :to', { from, to })
            .getMany();
    }

    /** Succeeded payments per invoice — the same sum `ArrearsService` and `PaymentService` take. */
    private async paidPerInvoice(invoiceIds: number[]): Promise<Map<number, number>> {
        if (invoiceIds.length === 0) return new Map();
        const rows = await this.paymentRepository
            .createQueryBuilder('payment')
            .select('payment.invoice_id', 'invoiceId')
            .addSelect('SUM(payment.amount)', 'paid')
            .andWhere('payment.invoice_id IN (:...invoiceIds)', { invoiceIds })
            .andWhere('payment.status = :status', { status: PaymentStatus.SUCCEEDED })
            .groupBy('payment.invoice_id')
            .getRawMany<{ invoiceId: number; paid: string }>();
        return new Map(rows.map((row) => [Number(row.invoiceId), Number(row.paid)]));
    }

    /** Money that landed between two calendar days, as the bank would list it. */
    private succeededPaymentsDated(fromDay: string, toDay: string): Promise<Payment[]> {
        return this.paymentRepository
            .createQueryBuilder('payment')
            .select(['payment.id', 'payment.amount', 'payment.method', 'payment.date'])
            .andWhere('payment.date BETWEEN :fromDay AND :toDay', { fromDay, toDay })
            .andWhere('payment.status = :status', { status: PaymentStatus.SUCCEEDED })
            .getMany();
    }

    /** How many payment rows of each state are dated in the range — the report's honesty line. */
    private async paymentCountsByStatus(fromDay: string, toDay: string): Promise<Map<PaymentStatus, number>> {
        const rows = await this.paymentRepository
            .createQueryBuilder('payment')
            .select('payment.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .andWhere('payment.date BETWEEN :fromDay AND :toDay', { fromDay, toDay })
            .groupBy('payment.status')
            .getRawMany<{ status: PaymentStatus; count: string }>();
        return new Map(rows.map((row) => [row.status, Number(row.count)]));
    }
}

function emptyMonth(month: string): FinanceMonth {
    return {
        month,
        invoiced: 0,
        invoices: 0,
        waived: 0,
        families: 0,
        collectedForMonth: 0,
        outstanding: 0,
        collectedInMonth: 0,
        byMethod: { cash: 0, bankTransfer: 0 },
        averagePerFamily: 0,
    };
}

/** Rounds every sum to the bani once the adding is done, so a month adds up on paper. */
function finish(row: FinanceMonth): FinanceMonth {
    return {
        ...row,
        invoiced: roundToBani(row.invoiced),
        collectedForMonth: roundToBani(row.collectedForMonth),
        outstanding: roundToBani(row.outstanding),
        collectedInMonth: roundToBani(row.collectedInMonth),
        byMethod: { cash: roundToBani(row.byMethod.cash), bankTransfer: roundToBani(row.byMethod.bankTransfer) },
        averagePerFamily: row.families === 0 ? 0 : roundToBani(row.invoiced / row.families),
    };
}
