import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { PAYMENT_RECORD_MAY_EXIST, PaymentFiscalStatus } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import type { SmartBillMode } from 'src/modules/smartbill/smartbill.config';

/**
 * Which payments go to SmartBill, and what a payment that went there may no longer do — E16/S5.
 *
 * Plain functions, like `payment-receipt.rules.ts` next door: "does this sum owe a line in the
 * school's fiscal records" is a question worth reading on its own, away from the queue.
 */

/**
 * The invoice states that are, or are on their way to being, a numbered fiscal invoice. `FAILED` is
 * among them: a refused invoice is retried by a person, and the money on it waits with it. `DRAFT`
 * is not — a draft has no number, and a collection can only be recorded on a numbered invoice.
 */
const HEADED_FOR_SMARTBILL: readonly InvoiceFiscalStatus[] = [
    InvoiceFiscalStatus.PENDING,
    InvoiceFiscalStatus.UNCERTAIN,
    InvoiceFiscalStatus.REVIEW,
    InvoiceFiscalStatus.ISSUED,
    InvoiceFiscalStatus.FAILED,
];

/**
 * A payment owes SmartBill a collection when it is money (`succeeded`), recorded while the platform
 * issues real invoices (`live`), against an invoice that is or will be one of them.
 *
 * In `draft` mode nothing is owed, and it is SmartBill's limit rather than ours: a draft invoice has
 * no number to record against, and of the collection types only the receipt has a draft form at
 * all — a transfer recorded in SmartBill is a line in the school's accounts the moment it is sent.
 * `pnpm smartbill:check --draft --receipt` is where a draft receipt can be looked at instead.
 */
export function owesSmartBillRecord(input: { mode: SmartBillMode; paymentStatus: PaymentStatus; invoiceFiscalStatus: InvoiceFiscalStatus | null }): boolean {
    return (
        input.mode === 'live' &&
        input.paymentStatus === PaymentStatus.SUCCEEDED &&
        input.invoiceFiscalStatus !== null &&
        HEADED_FOR_SMARTBILL.includes(input.invoiceFiscalStatus)
    );
}

/**
 * The fiscal state a payment is written with, on insert or edit.
 *
 * A record that exists in SmartBill, or may, is never taken back by an edit here: the platform does
 * not un-record by itself. Anything else follows what the payment owes now — so an edited refusal is
 * queued again, and a payment that stopped being money leaves the queue before it was ever sent.
 */
export function nextPaymentFiscalState(current: PaymentFiscalStatus | null, owes: boolean): PaymentFiscalStatus | null {
    if (current !== null && PAYMENT_RECORD_MAY_EXIST.includes(current)) return current;
    return owes ? PaymentFiscalStatus.PENDING : null;
}

/**
 * Whether an edit touches what SmartBill already holds: the sum, the day or the method of a payment
 * whose collection exists there, or may. Status, reference and notes stay editable — a transfer that
 * bounced is recorded here as `reversed`, and the collection in SmartBill is removed by hand, which
 * is what the divergence report (E16/S8) keeps pointing at until somebody does.
 */
export function editTouchesSmartBillRecord(
    current: { fiscalStatus: PaymentFiscalStatus | null; amount: number; method: string; date: string },
    changes: { amount?: number; method?: string; date?: string },
): boolean {
    if (current.fiscalStatus === null || !PAYMENT_RECORD_MAY_EXIST.includes(current.fiscalStatus)) return false;
    const moves = <T>(next: T | undefined, now: T) => next !== undefined && next !== now;
    return (
        moves(changes.amount === undefined ? undefined : Math.round(changes.amount * 100), Math.round(current.amount * 100)) ||
        moves(changes.method, current.method) ||
        moves(changes.date, current.date)
    );
}
