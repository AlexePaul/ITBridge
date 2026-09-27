import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import type { SmartBillMode } from 'src/modules/smartbill/smartbill.config';
import { paymentReference, type ReferencedInvoice } from './payment-reference';

/**
 * What a family writes on a transfer for an invoice — one answer, read by the invoice email, the
 * portal and the statement import. The number on the document the family holds.
 */
describe('paymentReference', () => {
    const invoice = (fields: Partial<ReferencedInvoice> = {}): ReferencedInvoice => ({
        id: 28,
        fiscalSeries: null,
        fiscalNumber: null,
        fiscalStatus: null,
        ...fields,
    });

    it("is SmartBill's series and number once it gave them", () => {
        const issued = invoice({ fiscalStatus: InvoiceFiscalStatus.ISSUED, fiscalSeries: 'ITB', fiscalNumber: '0041' });

        expect(paymentReference(issued, 'live')).toEqual({ text: 'factura ITB 0041', marker: 'ITB', number: '0041' });
    });

    // Stage today: SmartBill off, the platform's PDF is the invoice and prints „Număr factură: 28".
    it("is the platform's own number, in the email's words, while the platform's PDF is the invoice", () => {
        const cases: [InvoiceFiscalStatus | null, SmartBillMode][] = [
            [null, 'off'],
            [null, 'live'],
            [InvoiceFiscalStatus.PENDING, 'draft'],
            [InvoiceFiscalStatus.DRAFT, 'draft'],
        ];
        for (const [fiscalStatus, mode] of cases) {
            expect(paymentReference(invoice({ fiscalStatus }), mode)).toEqual({ text: 'factura nr. 28', marker: 'factura nr.', number: '28' });
        }
    });

    /**
     * In `live` the email waits for SmartBill's number, so a family has been told nothing yet — and a
     * line quoting "factura nr. 28" then is more likely a fiscal number with the series left out.
     */
    it('is nothing yet while a fiscal document is on its way', () => {
        for (const fiscalStatus of [InvoiceFiscalStatus.PENDING, InvoiceFiscalStatus.UNCERTAIN, InvoiceFiscalStatus.REVIEW, InvoiceFiscalStatus.FAILED]) {
            expect(paymentReference(invoice({ fiscalStatus }), 'live')).toBeNull();
        }
    });
});
