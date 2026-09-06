import { InvoiceStatus } from 'src/entities/invoice.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';

/**
 * When a receipt goes out, and which of the two it is — E16/S6.
 *
 * Plain functions, away from the service, so the rule can be asserted without a queue or a database
 * behind it. The same split as `arrears.rules.ts` next door, and for the same reason: the question
 * "does this family get written to" is the part worth being able to read on its own.
 */

/**
 * A receipt is owed when a payment **becomes** succeeded — not when a payment row is written.
 *
 * The distinction is the whole rule. An admin who records a bank transfer as `initiated` while the
 * statement is still unconfirmed has not received anything yet, and telling the family "am primit
 * plata" at that moment is a promise about somebody else's money. The confirmation belongs to the
 * moment the money is confirmed, which may be the insert or may be an edit days later.
 *
 * `previous` is `undefined` on an insert, and the previous stored status on an edit. A payment that
 * was already succeeded and is edited again — a corrected reference, a fixed date — returns false:
 * nothing became true, and a second "we received your money" for one payment reads as two payments.
 */
export function owesReceipt(next: PaymentStatus, previous?: PaymentStatus): boolean {
    if (next !== PaymentStatus.SUCCEEDED) return false;
    return previous !== PaymentStatus.SUCCEEDED;
}

/**
 * Which of the two receipts, from the balance after the payment landed.
 *
 * Read off the recomputed invoice state rather than compared here: `PaymentService` owns the sum of
 * succeeded payments, and a second `paid >= amount` in this file would be a second definition of
 * "covered" — free to disagree with the one that actually sets the invoice's status.
 */
export function receiptTemplate(status: InvoiceStatus): 'payment-received' | 'payment-received-partial' {
    return status === InvoiceStatus.PAID ? 'payment-received' : 'payment-received-partial';
}

/**
 * One receipt per payment, ever.
 *
 * Not per payment per day, as the arrears reminders are keyed: those recur by design and the day is
 * what separates one from the next. A payment is confirmed once, so the key carries nothing but its
 * id — and a retried request, or a second instance of the scheduler, writes nothing new.
 *
 * The cost of that choice, stated rather than hidden: a payment whose amount is corrected upward
 * after the receipt has gone leaves the family holding a figure that is no longer right. That is a
 * phone call, not a second email — an automated correction of a number somebody already read is
 * more confusing than the error, and rarer than the double-send it would prevent.
 */
export const RECEIPT_DEDUPE_PREFIX = 'receipt:';

export function receiptDedupeKey(paymentId: number): string {
    return `${RECEIPT_DEDUPE_PREFIX}${paymentId}`;
}
