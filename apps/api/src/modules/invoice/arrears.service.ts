import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, Not, LessThanOrEqual } from 'typeorm';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { ArrearsBucket, bucketFor, daysOverdue, daysUntilDue, dueDateFor, outstandingOf } from './arrears.rules';

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
    /** Transfers recorded as announced (`initiated`), not yet confirmed — not in `paid`. */
    announced: number;
    daysOverdue: number;
    bucket: ArrearsBucket;
}

/** What arrived against one invoice, and what is on its way. */
interface Received {
    paid: number;
    announced: number;
}

const NOTHING_RECEIVED: Received = { paid: 0, announced: 0 };

/** What arrived against an invoice, and what is left — attached to every invoice the API hands out. */
export interface InvoiceBalance {
    paid: number;
    outstanding: number;
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

        const receivedByInvoice = await this.receivedPerInvoice(invoices.map((invoice) => invoice.id));
        return this.rowsFor(invoices, receivedByInvoice, today);
    }

    /**
     * The same list as it stood at the end of `day` — for the retrospective check of the early
     * signals (E21 S7), and nothing else.
     *
     * `list` reads the invoices by their status **now** and adds up **every** payment, so asked
     * about 2 March after the family paid on 20 March it answered as if they had paid on the 2nd:
     * the digest that named them on Monday could no longer be checked (review of 25 September 2026).
     * Here an invoice counts if it had been issued by then, whatever it says now — only a waived
     * month owes nothing on any day — and a payment counts if it had arrived by then.
     */
    async asOf(day: Date): Promise<ArrearsRow[]> {
        const until = toIsoDate(day);
        const invoices = await this.invoiceRepository.find({
            where: { status: Not(InvoiceStatus.WAIVED), dateIssued: LessThanOrEqual(until) as unknown as Date },
            relations: { parent: true },
            order: { dateIssued: 'ASC' },
        });
        if (invoices.length === 0) return [];

        const receivedByInvoice = await this.receivedPerInvoice(
            invoices.map((invoice) => invoice.id),
            until,
        );
        return this.rowsFor(invoices, receivedByInvoice, day);
    }

    private rowsFor(invoices: Invoice[], receivedByInvoice: Map<number, Received>, today: Date): ArrearsRow[] {
        return (
            invoices
                .map((invoice) => {
                    const { paid, announced } = receivedByInvoice.get(invoice.id) ?? NOTHING_RECEIVED;
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
                        outstanding: outstandingOf(invoice.amount, paid),
                        announced,
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
     * The invoices as the API hands them out, each with what arrived against it and what is left —
     * the review of 25 September 2026. The portal showed a family that had paid 100 of 350 the
     * whole 350 as still to pay, and a family that pays what the screen says pays twice. The same
     * sum and the same subtraction as `list`, so the two cannot disagree about one invoice. A
     * waived month owes nothing and can receive nothing (`INVOICE_WAIVED`).
     */
    async withBalances<T extends Invoice>(invoices: T[]): Promise<(T & InvoiceBalance)[]> {
        const receivedByInvoice = invoices.length === 0 ? new Map<number, Received>() : await this.receivedPerInvoice(invoices.map((invoice) => invoice.id));
        return invoices.map((invoice) => {
            if (invoice.status === InvoiceStatus.WAIVED) return { ...invoice, paid: 0, outstanding: 0 };
            const { paid } = receivedByInvoice.get(invoice.id) ?? NOTHING_RECEIVED;
            return { ...invoice, paid, outstanding: outstandingOf(invoice.amount, paid) };
        });
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

        // Still `pending` in the WHERE, not only in the read above: a payment committed between the
        // two would otherwise see its invoice, just paid, turned back to `overdue`.
        const moved = await this.invoiceRepository.update(
            { id: In(late.map((invoice) => invoice.id)), status: InvoiceStatus.PENDING },
            { status: InvoiceStatus.OVERDUE },
        );
        const count = moved.affected ?? late.length;
        this.logger.log(`Marked ${count} invoice(s) overdue as of ${toIsoDate(today)}.`);
        return count;
    }

    /**
     * Per invoice, what arrived and what is announced. Only succeeded payments are `paid`: an
     * announced transfer has not arrived, so it settles nothing — it is counted apart, for the
     * screens that must not record it twice and the reminders that must not chase it (E16/S6).
     */
    private async receivedPerInvoice(invoiceIds: number[], until?: string): Promise<Map<number, Received>> {
        const qb = this.paymentRepository
            .createQueryBuilder('payment')
            .select('payment.invoice_id', 'invoiceId')
            .addSelect('COALESCE(SUM(payment.amount) FILTER (WHERE payment.status = :succeeded), 0)', 'paid')
            .addSelect('COALESCE(SUM(payment.amount) FILTER (WHERE payment.status = :initiated), 0)', 'announced')
            .where('payment.invoice_id IN (:...invoiceIds)', { invoiceIds })
            .andWhere('payment.status IN (:succeeded, :initiated)', { succeeded: PaymentStatus.SUCCEEDED, initiated: PaymentStatus.INITIATED });
        if (until) qb.andWhere('payment.date <= :until', { until });
        const rows = await qb.groupBy('payment.invoice_id').getRawMany<{ invoiceId: number; paid: string; announced: string }>();

        return new Map(rows.map((row) => [Number(row.invoiceId), { paid: Number(row.paid), announced: Number(row.announced) }]));
    }
}
