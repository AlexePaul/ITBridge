import type { ISODate, ISODateTime } from './common';
import type { Invoice, SmartBillMode } from './invoice';

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
 * Where a payment stands with SmartBill — E16/S5. Mirrors `PaymentFiscalStatus` in
 * `apps/api/src/entities/payment.entity.ts`; `null` on the payment means it never goes there.
 * `review` is a lost answer after which the invoice's paid amount moved: a person confirms.
 */
export type PaymentFiscalStatus = 'pending' | 'uncertain' | 'review' | 'recorded' | 'failed';

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
    notes: string | null;
    fiscalStatus: PaymentFiscalStatus | null;
    /** The receipt SmartBill numbered for a cash payment. Empty for a transfer, which has no document. */
    fiscalReceiptSeries: string | null;
    fiscalReceiptNumber: string | null;
    fiscalRecordedAt: ISODateTime | null;
    /** SmartBill's sentence for a refusal, or what went wrong with the last attempt. */
    fiscalLastError: string | null;
    /** Under review for a cash payment: the receipt number it probably took. */
    fiscalExpectedNumber: number | null;
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

/** The payments' side of the fiscal queue, for the admin screen — `GET /payments/fiscal-queue`. */
export interface PaymentFiscalQueueStatus {
    mode: SmartBillMode;
    /** What keeps the queue from moving. Always empty outside `live`, where payments do not go. */
    missing: string[];
    receiptSeries: string | null;
    lockedUntil: ISODateTime | null;
    /** Pending payments whose invoice SmartBill has not numbered yet. */
    waitingForInvoice: number;
    counts: Record<PaymentFiscalStatus, number>;
}

export interface ConfirmPaymentRecordDto {
    /** The receipt's number, as read in SmartBill. Required for cash. */
    number?: string;
}
