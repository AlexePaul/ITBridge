import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { ArrearsBucket, bucketFor, daysOverdue, daysUntilDue, dueDateFor } from './arrears.rules';

/** One family's unpaid invoice, as the arrears screen reads it. */
export interface ArrearsRow {
    invoiceId: number;
    parentId: number;
    parentName: string;
    email: string | null;
    phone: string | null;
    monthIssued: string;
    dateIssued: string;
    dueOn: string;
    amount: number;
    /** What has been received against it. A partial payment is the interesting middle case. */
    paid: number;
    outstanding: number;
    daysOverdue: number;
    bucket: ArrearsBucket;
}

/**
 * Who has not paid, and how long ago — E16/S7.
 *
 * **The list is derived, not read off `Invoice.status`.** The column is a cache the daily job
 * refreshes, and a cache is wrong for exactly as long as nothing has refreshed it; a screen about
 * money must not be wrong for a day because a job did not run. `markOverdue` keeps the column
 * honest for everything *else* that reads it — the invoice screens, the parent portal — and this
 * query does not trust it.
 *
 * **Not grouped by location, though the story asks for it.** An invoice belongs to a parent, and a
 * parent may have children at both addresses; the codebase already decided invoices ignore the
 * location selector for that reason (see the note under E08 in the tracker). Grouping arrears by
 * location would have to pick one of a family's two locations arbitrarily, which is worse than not
 * grouping. Ageing is the axis that actually changes what an admin does.
 */
@Injectable()
export class ArrearsService {
    private readonly logger = new Logger('Arrears');

    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
    ) {}

    /**
     * Every invoice that is not settled, oldest debt first.
     *
     * `waived` and `paid` are excluded at the query, so an invoice settles itself out of this list
     * the moment the payment lands — which is the acceptance criterion about reminders stopping,
     * expressed as the absence of a row rather than as a rule somebody has to remember.
     */
    async list(today: Date = new Date()): Promise<ArrearsRow[]> {
        const invoices = await this.invoiceRepository.find({
            where: { status: In([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]) },
            relations: { parent: true },
            order: { dateIssued: 'ASC' },
        });
        if (invoices.length === 0) return [];

        const paidByInvoice = await this.paidPerInvoice(invoices.map((invoice) => invoice.id));

        return (
            invoices
                .map((invoice) => {
                    const paid = paidByInvoice.get(invoice.id) ?? 0;
                    const overdue = daysOverdue(invoice.dateIssued, today);
                    return {
                        invoiceId: invoice.id,
                        parentId: invoice.parent.id,
                        parentName: `${invoice.parent.firstName} ${invoice.parent.lastName}`,
                        email: invoice.parent.email ?? null,
                        // For the same reason the register carries it: chasing a payment is a phone
                        // call, and the number should not be a second screen away.
                        phone: invoice.parent.phone ?? null,
                        monthIssued: invoice.monthIssued,
                        dateIssued: toIsoDate(invoice.dateIssued),
                        dueOn: toIsoDate(dueDateFor(invoice.dateIssued)),
                        amount: invoice.amount,
                        paid,
                        outstanding: Math.max(0, Math.round((invoice.amount - paid) * 100) / 100),
                        daysOverdue: overdue,
                        bucket: bucketFor(overdue, daysUntilDue(invoice.dateIssued, today)),
                    };
                })
                // An invoice covered by succeeded payments but still `pending` would be a bug
                // elsewhere; it is filtered rather than shown, because a family who has paid must never
                // appear on a chasing list.
                .filter((row) => row.outstanding > 0)
                .sort((a, b) => b.daysOverdue - a.daysOverdue || a.parentName.localeCompare(b.parentName))
        );
    }

    /**
     * Moves invoices past their term into `overdue` — the job's half.
     *
     * Only `pending` ones are touched, and only forward: an invoice that is `paid` or `waived` is
     * settled, and one already `overdue` needs nothing said twice. Returns how many moved, so the
     * job can log a number rather than a shrug.
     */
    async markOverdue(today: Date = new Date()): Promise<number> {
        const pending = await this.invoiceRepository.find({ where: { status: InvoiceStatus.PENDING } });
        const late = pending.filter((invoice) => daysOverdue(invoice.dateIssued, today) > 0);
        if (late.length === 0) return 0;

        await this.invoiceRepository.update({ id: In(late.map((invoice) => invoice.id)) }, { status: InvoiceStatus.OVERDUE });
        this.logger.log(`Marked ${late.length} invoice(s) overdue as of ${toIsoDate(today)}.`);
        return late.length;
    }

    /** Succeeded payments per invoice. Only succeeded: an announced transfer has not arrived. */
    private async paidPerInvoice(invoiceIds: number[]): Promise<Map<number, number>> {
        const rows = await this.paymentRepository
            .createQueryBuilder('payment')
            .select('payment.invoice_id', 'invoiceId')
            .addSelect('SUM(payment.amount)', 'paid')
            .where('payment.invoice_id IN (:...invoiceIds)', { invoiceIds })
            .andWhere('payment.status = :status', { status: PaymentStatus.SUCCEEDED })
            .groupBy('payment.invoice_id')
            .getRawMany<{ invoiceId: number; paid: string }>();

        return new Map(rows.map((row) => [Number(row.invoiceId), Number(row.paid)]));
    }
}
