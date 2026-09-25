import { PaymentMethod } from 'src/enum/payment-method.enum';
import {
    draftReceiptPayload,
    paymentPayload,
    paymentTypeFor,
    readPaymentStatus,
    readRecordedPayment,
    reconcilePayment,
    type FiscalPaymentInput,
} from './smartbill-payment.rules';

/**
 * The half of E16/S5 that needs no network. Every expectation about SmartBill's behaviour is quoted
 * from the OpenAPI spec they publish — a wrong guess about a fiscal API is a wrong line in the
 * school's accounts, not a failing test.
 */
describe('SmartBill payment rules', () => {
    const config = { cif: 'RO12345678', receiptSeries: 'CH' };
    const input: FiscalPaymentInput = {
        paymentId: 57,
        amount: 200,
        date: '2026-11-05',
        method: PaymentMethod.CASH,
        invoice: { series: 'ITB', number: '0041' },
    };

    describe('paymentPayload', () => {
        // "`Chitanta` si `Bon` genereaza documente numerotate … Celelalte tipuri emit incasarea fara
        // document separat."
        it('records cash as a numbered receipt on the platform receipt series', () => {
            expect(paymentTypeFor(PaymentMethod.CASH)).toBe('Chitanta');
            expect(paymentPayload(input, config)).toMatchObject({ type: 'Chitanta', seriesName: 'CH', isCash: true });
        });

        it('records a transfer as a payment order, with no series and no document', () => {
            const payload = paymentPayload({ ...input, method: PaymentMethod.BANK_TRANSFER }, config);

            expect(payload.type).toBe('Ordin plata');
            expect(payload).not.toHaveProperty('seriesName');
            expect(payload).not.toHaveProperty('isCash');
        });

        // With `useInvoiceDetails` SmartBill would take the invoice's whole total — "o incasare cu
        // `value: 50` inregistreaza 50 si lasa 61 de incasat" is how a partial one is recorded.
        it('links the invoice, takes the client from it, and always names the sum', () => {
            expect(paymentPayload(input, config)).toMatchObject({
                companyVatCode: 'RO12345678',
                issueDate: '2026-11-05',
                value: 200,
                useInvoiceDetails: true,
                invoicesList: [{ seriesName: 'ITB', number: '0041' }],
                text: 'Contravaloare factura ITB 0041',
                observation: 'Nr. intern ITBridge: plata 57.',
            });
        });

        it('is never a draft — a draft invoice has no number to record against', () => {
            expect(paymentPayload(input, config)).not.toHaveProperty('isDraft');
        });

        it('sends no client of its own: a family has no CIF to match the invoice on', () => {
            expect(paymentPayload(input, config)).not.toHaveProperty('client');
        });
    });

    describe('draftReceiptPayload', () => {
        it('is a draft receipt that stands alone, for the check script', () => {
            const payload = draftReceiptPayload({ amount: 175, date: '2026-11-05', client: { name: 'TEST', address: null } }, config);

            expect(payload).toMatchObject({ type: 'Chitanta', isDraft: true, isCash: true, seriesName: 'CH', value: 175 });
            expect(payload.client).toEqual({ name: 'TEST', country: 'Romania', isTaxPayer: false, saveToDb: false });
            expect(payload).not.toHaveProperty('invoicesList');
        });
    });

    describe('readPaymentStatus', () => {
        it('reads the four figures of GET /invoice/paymentstatus', () => {
            expect(readPaymentStatus({ errorText: '', invoiceTotalAmount: 350, paidAmount: 200, unpaidAmount: 150, paid: false })).toEqual({
                total: 350,
                paid: 200,
                unpaid: 150,
                isPaid: false,
            });
        });

        it('takes figures that arrive as text', () => {
            expect(readPaymentStatus({ invoiceTotalAmount: '350.00', paidAmount: '0' })).toMatchObject({ total: 350, paid: 0, unpaid: 350 });
        });

        // A paid amount guessed as zero would make every lost answer look like nothing happened.
        it('answers nothing, never zero, for an answer without the paid amount', () => {
            expect(readPaymentStatus({ errorText: '', invoiceTotalAmount: 350 })).toBeNull();
            expect(readPaymentStatus(null)).toBeNull();
        });
    });

    describe('readRecordedPayment', () => {
        it('keeps the receipt number, and nothing for a transfer', () => {
            expect(readRecordedPayment({ errorText: '', number: '0007', series: 'CH', url: '' })).toEqual({ series: 'CH', number: '0007' });
            expect(readRecordedPayment({ errorText: '', message: '', number: '', series: '', url: '' })).toEqual({ series: null, number: null });
        });
    });

    describe('reconcilePayment', () => {
        const lost = { expectedPaid: 150, value: 200, expectedNumber: null, nextNumberNow: null };

        it('sends again a request that was never sent — the paid amount is written before the call', () => {
            expect(reconcilePayment({ ...lost, expectedPaid: null, paidNow: 350 })).toEqual({ outcome: 'not_sent' });
        });

        it('sends again when the paid amount did not move: nothing was recorded on the invoice', () => {
            expect(reconcilePayment({ ...lost, paidNow: 150 })).toEqual({ outcome: 'not_recorded' });
        });

        // "Almost certainly ours" is not the bar for a fiscal record, as it was not for invoices.
        it('hands a paid amount that moved by exactly this payment to a person', () => {
            expect(reconcilePayment({ ...lost, paidNow: 350 })).toMatchObject({ outcome: 'needs_review', probableNumber: null });
        });

        it('names the probable receipt when the receipt series moved by one as well', () => {
            expect(reconcilePayment({ ...lost, paidNow: 350, expectedNumber: 7, nextNumberNow: 8 })).toMatchObject({
                outcome: 'needs_review',
                probableNumber: 7,
            });
            expect(reconcilePayment({ ...lost, paidNow: 350, expectedNumber: 7, nextNumberNow: 9 })).toMatchObject({ probableNumber: null });
        });

        it('does not guess when the paid amount moved by anything else', () => {
            expect(reconcilePayment({ ...lost, paidNow: 250 })).toMatchObject({ outcome: 'needs_review', probableNumber: null });
        });

        it('compares in bani, so floating lei cannot invent a movement', () => {
            expect(reconcilePayment({ expectedPaid: 0.1 + 0.2, value: 87.5, paidNow: 0.3, expectedNumber: null, nextNumberNow: null })).toEqual({
                outcome: 'not_recorded',
            });
        });
    });
});
