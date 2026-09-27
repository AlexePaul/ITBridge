import type { Invoice } from 'src/entities/invoice.entity';
import type { SmartBillMode } from 'src/modules/smartbill/smartbill.config';
import { servesLocalPdf } from './fiscal-issuing.rules';

/**
 * What a family writes in a bank transfer's details for an invoice — and what the statement import
 * looks for there. One answer, read in three places: the email that announces the invoice, the
 * portal's payments page and the reconciliation matcher. The family is asked to write exactly what
 * the matcher reads as a sure match, so the two cannot drift apart.
 *
 * It used to be two answers. The email printed the platform's own number when SmartBill had not
 * given one — `off`, stage today — and the matcher knew only the fiscal shape, so every line that
 * did what the email asked fell back to the payer's name and the sum, and none of them reached the
 * one press that confirms the sure ones (QA of 27 September 2026).
 *
 * The reference is the number on the document the family holds:
 *
 *  - SmartBill's series and number, once it gave them: `factura ITB 0041`;
 *  - the platform's own number while the platform's PDF is the invoice (`servesLocalPdf`; it prints
 *    „Număr factură: 28"): `factura nr. 28`, the words the email has always used;
 *  - nothing yet while SmartBill's document is on its way in `live`. Nobody has been told a number —
 *    the email waits for the fiscal one — and a line quoting „factura nr. 28" then is more likely
 *    another family's fiscal invoice ITB 0028 with the series left out than this one.
 */
export interface PaymentReference {
    /** As the email and the portal print it: `factura ITB 0041`, `factura nr. 28`. */
    text: string;
    /**
     * What has to stand right before the number for a transfer's details to be quoting it. The fiscal
     * series names an invoice on its own — `ITB 0041` is a reference with or without the word before
     * it. The platform's number does not: „nr. 28" alone is a flat, a contract, an order, so for it the
     * words the email prints are the marker, whole.
     */
    marker: string;
    /** As printed. A transfer may write it with or without the leading zeros. */
    number: string;
}

export type ReferencedInvoice = Pick<Invoice, 'id' | 'fiscalSeries' | 'fiscalNumber' | 'fiscalStatus'>;

/** The words the platform's own invoice is named by, before its number. */
const PLATFORM_MARKER = 'factura nr.';

export function paymentReference(invoice: ReferencedInvoice, mode: SmartBillMode): PaymentReference | null {
    if (invoice.fiscalSeries && invoice.fiscalNumber) {
        return { text: `factura ${invoice.fiscalSeries} ${invoice.fiscalNumber}`, marker: invoice.fiscalSeries, number: invoice.fiscalNumber };
    }
    if (!servesLocalPdf(invoice.fiscalStatus, mode)) return null;
    const number = String(invoice.id);
    return { text: `${PLATFORM_MARKER} ${number}`, marker: PLATFORM_MARKER, number };
}

/** Whether the reference is the platform's own number, `factura nr. 28`, rather than a fiscal one. */
export function isPlatformReference(reference: PaymentReference): boolean {
    return reference.marker === PLATFORM_MARKER;
}

/** An invoice as the portal reads it: with the words to write on a transfer, or `null` while there are none yet. */
export function withPaymentReference<T extends ReferencedInvoice>(invoice: T, mode: SmartBillMode): T & { paymentReference: string | null } {
    return { ...invoice, paymentReference: paymentReference(invoice, mode)?.text ?? null };
}
