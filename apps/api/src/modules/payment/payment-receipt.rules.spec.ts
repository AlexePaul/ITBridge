import { InvoiceStatus } from 'src/entities/invoice.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { owesReceipt, receiptDedupeKey, receiptTemplate } from './payment-receipt.rules';

/**
 * The rule on its own — E16/S6.
 *
 * No queue, no database, no template. What is being pinned here is the question "does this family
 * get told", which is the part that would go wrong quietly: a receipt withheld looks like nothing,
 * and a receipt sent twice looks like two payments.
 */
describe('owesReceipt', () => {
    it('is owed when a payment is recorded as succeeded', () => {
        expect(owesReceipt(PaymentStatus.SUCCEEDED)).toBe(true);
    });

    it.each([PaymentStatus.INITIATED, PaymentStatus.FAILED])('is not owed for a %s payment', (status) => {
        // The money has not arrived, or has not arrived any more. "Am primit plata" would be a
        // statement about somebody else's bank, made before it is true.
        expect(owesReceipt(status)).toBe(false);
    });

    it('is owed when an initiated payment is later confirmed', () => {
        // The real bank-transfer path: an admin records the line while the statement is provisional
        // and confirms it days later. That later moment is when the family can honestly be told.
        expect(owesReceipt(PaymentStatus.SUCCEEDED, PaymentStatus.INITIATED)).toBe(true);
    });

    it('is not owed again when an already-succeeded payment is edited', () => {
        // A corrected reference or a fixed date changes nothing about whether the money arrived,
        // and a second confirmation for one payment reads as a second payment.
        expect(owesReceipt(PaymentStatus.SUCCEEDED, PaymentStatus.SUCCEEDED)).toBe(false);
    });

    it('is not owed when a succeeded payment is walked back', () => {
        expect(owesReceipt(PaymentStatus.FAILED, PaymentStatus.SUCCEEDED)).toBe(false);
    });
});

describe('receiptTemplate', () => {
    it('confirms the invoice is settled when the payment covered it', () => {
        expect(receiptTemplate(InvoiceStatus.PAID)).toBe('payment-received');
    });

    it.each([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE])('names what is left when the invoice is still %s', (status) => {
        expect(receiptTemplate(status)).toBe('payment-received-partial');
    });
});

describe('receiptDedupeKey', () => {
    it('is per payment, not per payment per day', () => {
        // Unlike the arrears reminders, which recur by design and are separated by the day. A
        // payment is confirmed once, so a retried request writes nothing new.
        expect(receiptDedupeKey(41)).toBe('receipt:41');
        expect(receiptDedupeKey(41)).toBe(receiptDedupeKey(41));
        expect(receiptDedupeKey(42)).not.toBe(receiptDedupeKey(41));
    });
});
