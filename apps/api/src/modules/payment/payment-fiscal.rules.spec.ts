import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { PaymentFiscalStatus } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { editTouchesSmartBillRecord, nextPaymentFiscalState, owesSmartBillRecord } from './payment-fiscal.rules';

/** Which payments go to SmartBill, and what one that went there may no longer do — E16/S5. */
describe('payment fiscal rules', () => {
    describe('owesSmartBillRecord', () => {
        const owed = { mode: 'live' as const, paymentStatus: PaymentStatus.SUCCEEDED, invoiceFiscalStatus: InvoiceFiscalStatus.ISSUED };

        it('owes a collection for money received in live against an invoice SmartBill numbers', () => {
            expect(owesSmartBillRecord(owed)).toBe(true);
        });

        // The collection waits for the number; it is still owed.
        it('owes it while the invoice is still on its way, or waiting on a person', () => {
            for (const invoiceFiscalStatus of [
                InvoiceFiscalStatus.PENDING,
                InvoiceFiscalStatus.UNCERTAIN,
                InvoiceFiscalStatus.REVIEW,
                InvoiceFiscalStatus.FAILED,
            ]) {
                expect(owesSmartBillRecord({ ...owed, invoiceFiscalStatus })).toBe(true);
            }
        });

        it('owes nothing on a draft invoice, which has no number, or one that never went to SmartBill', () => {
            expect(owesSmartBillRecord({ ...owed, invoiceFiscalStatus: InvoiceFiscalStatus.DRAFT })).toBe(false);
            expect(owesSmartBillRecord({ ...owed, invoiceFiscalStatus: null })).toBe(false);
        });

        // Of the collection types only the receipt has a draft form; a transfer sent from `draft`
        // would be a line in the school's accounts.
        it("owes nothing outside 'live'", () => {
            expect(owesSmartBillRecord({ ...owed, mode: 'draft' })).toBe(false);
            expect(owesSmartBillRecord({ ...owed, mode: 'off' })).toBe(false);
        });

        it('owes nothing for a payment that is not money', () => {
            for (const paymentStatus of [PaymentStatus.INITIATED, PaymentStatus.FAILED, PaymentStatus.REVERSED]) {
                expect(owesSmartBillRecord({ ...owed, paymentStatus })).toBe(false);
            }
        });
    });

    describe('nextPaymentFiscalState', () => {
        it('queues what is owed and leaves out what is not', () => {
            expect(nextPaymentFiscalState(null, true)).toBe(PaymentFiscalStatus.PENDING);
            expect(nextPaymentFiscalState(null, false)).toBeNull();
            expect(nextPaymentFiscalState(PaymentFiscalStatus.PENDING, false)).toBeNull();
        });

        it('queues a refused payment again once it has been touched', () => {
            expect(nextPaymentFiscalState(PaymentFiscalStatus.FAILED, true)).toBe(PaymentFiscalStatus.PENDING);
        });

        // The platform does not un-record by itself.
        it('never takes back a record that exists in SmartBill, or may', () => {
            for (const current of [PaymentFiscalStatus.UNCERTAIN, PaymentFiscalStatus.REVIEW, PaymentFiscalStatus.RECORDED]) {
                expect(nextPaymentFiscalState(current, false)).toBe(current);
                expect(nextPaymentFiscalState(current, true)).toBe(current);
            }
        });
    });

    describe('editTouchesSmartBillRecord', () => {
        const recorded = { fiscalStatus: PaymentFiscalStatus.RECORDED, amount: 350, method: 'cash', date: '2026-03-10' };

        it('catches a new sum, day or method on a payment SmartBill holds', () => {
            expect(editTouchesSmartBillRecord(recorded, { amount: 300 })).toBe(true);
            expect(editTouchesSmartBillRecord(recorded, { date: '2026-03-11' })).toBe(true);
            expect(editTouchesSmartBillRecord(recorded, { method: 'bank_transfer' })).toBe(true);
        });

        it('lets the same values through, and everything on a payment SmartBill does not hold', () => {
            expect(editTouchesSmartBillRecord(recorded, { amount: 350, method: 'cash', date: '2026-03-10' })).toBe(false);
            expect(editTouchesSmartBillRecord({ ...recorded, fiscalStatus: PaymentFiscalStatus.FAILED }, { amount: 300 })).toBe(false);
            expect(editTouchesSmartBillRecord({ ...recorded, fiscalStatus: null }, { amount: 300 })).toBe(false);
        });

        it('compares the sum in bani', () => {
            expect(editTouchesSmartBillRecord({ ...recorded, amount: 0.1 + 0.2 }, { amount: 0.3 })).toBe(false);
        });
    });
});
