import type { ISODate, ISODateTime } from './common';
import type { Invoice } from './invoice';

/**
 * How money reaches the school — E16/S1. Mirrors `PaymentMethod` in
 * `apps/api/src/enum/payment-method.enum.ts`. A closed list of two, because the school collects
 * exactly two ways; card-in-portal was cut from the MVP by decision (E16 S4).
 *
 * A union of literals, not an enum — this package is CommonJS and ships no runtime values; the
 * Romanian labels live next to the screens, in `apps/web/app/types/payment.types.ts`.
 */
export type PaymentMethod = 'cash' | 'bank_transfer';

/**
 * The life of one recorded payment. Mirrors `PaymentStatus` in
 * `apps/api/src/enum/payment-status.enum.ts`. Only `succeeded` pays an invoice down.
 */
export type PaymentStatus = 'initiated' | 'succeeded' | 'failed' | 'reversed';

/**
 * One sum of money, received once.
 *
 * Many per invoice: instalments are normal life. Whether the invoice is paid is derived on the
 * server from the sum of the succeeded payments — the client never sets it.
 */
export interface Payment {
    id: number;
    invoice: Invoice;
    /** The figure, in lei. The whole point of the E16/S1 rework. */
    amount: number;
    method: PaymentMethod;
    status: PaymentStatus;
    /** The day the money moved, not the day it was typed in. */
    date: ISODate;
    /** Payment-order or cash-receipt number — what a bank statement can be joined on. */
    externalReference: string | null;
    /** The receipt's id in SmartBill, once E16 S2 pushes them there. Empty until then. */
    smartbillReference: string | null;
    notes: string | null;
    /** Only id and username come over the wire — never the credentials row. */
    recordedBy?: { id: number; username: string } | null;
    createdAt: ISODateTime;
}

export interface CreatePaymentDto {
    invoiceId: number;
    /** Required and positive. Not capped at the invoice total: paying ahead is normal. */
    amount: number;
    /** Defaults to `cash` on the server. */
    method?: PaymentMethod;
    /** Defaults to `succeeded` — an admin records money that arrived. */
    status?: PaymentStatus;
    date: ISODate;
    externalReference?: string;
    notes?: string;
}

export interface UpdatePaymentDto {
    amount?: number;
    method?: PaymentMethod;
    status?: PaymentStatus;
    date?: ISODate;
    externalReference?: string;
    notes?: string;
}

export interface FilterPaymentDto {
    invoiceId?: number;
    dateFrom?: ISODate;
    dateTo?: ISODate;
}
