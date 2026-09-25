import { PaymentMethod } from 'src/enum/payment-method.enum';
import type { SmartBillConfig } from './smartbill.config';

/**
 * Money on an invoice — E16/S5 and S6. The half of SmartBill V1 that records collections rather than
 * issuing documents: `POST /payment` and `GET /invoice/paymentstatus`.
 *
 * Two facts from the spec shape everything here, and neither is the invoice's:
 *
 *  - **Only a `Chitanta` is a document.** It is numbered on the receipt series the request names. A
 *    bank transfer (`Ordin plata`) is recorded on the invoice with no document — the answer carries
 *    no number, no series and no identifier at all.
 *  - **There is no idempotency key here either**, and for a transfer not even a number to look for.
 *    What a request would have changed is the invoice's paid amount, which `GET
 *    /invoice/paymentstatus` reads — so that is the proof, read before the request and again after a
 *    lost answer, the way the series is for invoices.
 */

export type SmartBillPaymentType = 'Chitanta' | 'Ordin plata';

export interface SmartBillPaymentRequest {
    companyVatCode: string;
    issueDate: string;
    type: SmartBillPaymentType;
    value: number;
    currency: 'RON';
    precision: 2;
    language: 'RO';
    /** "Descrierea incasarii" — what the receipt says the money was for. */
    text: string;
    observation: string;
    /**
     * The client and the currency come from the invoice. Sending our own client would have to match
     * the invoice's to the letter — "Ciful clientului de pe factura … difera de ciful clientului
     * incasarii!" — and a family has no CIF to match on.
     */
    useInvoiceDetails?: true;
    invoicesList?: { seriesName: string; number: string }[];
    /** Only on a receipt that stands alone — the check script's draft, which has no invoice to lean on. */
    client?: { name: string; address?: string; country: 'Romania'; isTaxPayer: false; saveToDb: false };
    /** A receipt only: the platform's receipt series. */
    seriesName?: string;
    isCash?: true;
    isDraft?: boolean;
}

export interface FiscalPaymentInput {
    paymentId: number;
    amount: number;
    /** `YYYY-MM-DD`: the day the money moved, which is the day on the receipt. */
    date: string;
    method: PaymentMethod;
    /** The invoice's fiscal number — a collection can only be recorded on a numbered invoice. */
    invoice: { series: string; number: string };
}

/** Cash becomes a numbered receipt; a transfer, a collection by payment order with no document. */
export function paymentTypeFor(method: PaymentMethod): SmartBillPaymentType {
    return method === PaymentMethod.CASH ? 'Chitanta' : 'Ordin plata';
}

/**
 * The request for one payment. `value` is always sent: with `useInvoiceDetails` SmartBill would
 * otherwise take the invoice's whole total, and "o incasare cu `value: 50` inregistreaza 50 si lasa
 * 61 de incasat" is exactly how a partial payment is recorded.
 */
export function paymentPayload(input: FiscalPaymentInput, config: Pick<SmartBillConfig, 'cif' | 'receiptSeries'>): SmartBillPaymentRequest {
    const type = paymentTypeFor(input.method);
    return {
        companyVatCode: config.cif ?? '',
        issueDate: input.date,
        type,
        value: input.amount,
        currency: 'RON',
        precision: 2,
        language: 'RO',
        text: `Contravaloare factura ${input.invoice.series} ${input.invoice.number}`,
        observation: `Nr. intern ITBridge: plata ${input.paymentId}.`,
        useInvoiceDetails: true,
        invoicesList: [{ seriesName: input.invoice.series, number: input.invoice.number }],
        ...(type === 'Chitanta' ? { seriesName: config.receiptSeries ?? '', isCash: true as const } : {}),
    };
}

/**
 * One draft receipt that stands alone, for `pnpm smartbill:check --draft --receipt`.
 *
 * The only way to look at a SmartBill receipt without a fiscal effect: "Chitanta ciorna" exists, but
 * a draft invoice has no number to link it to, so the queue never sends one — see
 * `owesSmartBillRecord`. This shows the series, the layout and the wording, and is deleted after.
 */
export function draftReceiptPayload(
    input: { amount: number; date: string; client: { name: string; address: string | null } },
    config: Pick<SmartBillConfig, 'cif' | 'receiptSeries'>,
): SmartBillPaymentRequest {
    return {
        companyVatCode: config.cif ?? '',
        issueDate: input.date,
        type: 'Chitanta',
        value: input.amount,
        currency: 'RON',
        precision: 2,
        language: 'RO',
        text: 'Contravaloare factura (ciornă de verificare)',
        observation: 'Ciornă trimisă de pnpm smartbill:check; se șterge.',
        client: {
            name: input.client.name,
            ...(input.client.address ? { address: input.client.address } : {}),
            country: 'Romania',
            isTaxPayer: false,
            saveToDb: false,
        },
        seriesName: config.receiptSeries ?? '',
        isCash: true,
        isDraft: true,
    };
}

export interface InvoicePaymentStatus {
    total: number;
    paid: number;
    unpaid: number;
    isPaid: boolean;
}

/**
 * `GET /invoice/paymentstatus`, read defensively: `null` for an answer without the figures, which
 * the caller treats as an unanswered read rather than as zero — a paid amount guessed as 0 would
 * make every lost answer look like nothing happened.
 */
export function readPaymentStatus(body: unknown): InvoicePaymentStatus | null {
    if (typeof body !== 'object' || body === null) return null;
    const record = body as Record<string, unknown>;
    const total = figure(record.invoiceTotalAmount);
    const paid = figure(record.paidAmount);
    if (total === null || paid === null) return null;
    const unpaid = figure(record.unpaidAmount) ?? Math.max(0, total - paid);
    return { total, paid, unpaid, isPaid: record.paid === true };
}

export interface RecordedPayment {
    /** Empty for anything but a receipt: a transfer is recorded without a document. */
    series: string | null;
    number: string | null;
}

export function readRecordedPayment(body: unknown): RecordedPayment {
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const text = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
    return { series: text(record.series), number: text(record.number) };
}

export type PaymentReconciliation =
    { outcome: 'not_sent' } | { outcome: 'not_recorded' } | { outcome: 'needs_review'; probableNumber: number | null; reason: string };

/**
 * What a lost answer meant, from the invoice's paid amount in SmartBill before and after.
 *
 *  - Nothing written before the call: the request never went out.
 *  - **Unchanged**: nothing was recorded on the invoice — whatever else moved — so sending again
 *    cannot make a second collection.
 *  - **Moved by exactly this payment**: almost certainly ours, and "almost certainly" is not the bar
 *    for a fiscal record, as it was not for invoices. A person confirms. For a receipt, a series
 *    that moved by one names the probable number.
 *  - Anything else: something besides this request touched the invoice. A person, with no guess.
 *
 * Compared in bani, never in floating lei.
 */
export function reconcilePayment(input: {
    expectedPaid: number | null;
    paidNow: number;
    value: number;
    expectedNumber: number | null;
    nextNumberNow: number | null;
}): PaymentReconciliation {
    if (input.expectedPaid === null) return { outcome: 'not_sent' };

    const before = bani(input.expectedPaid);
    const now = bani(input.paidNow);
    if (now === before) return { outcome: 'not_recorded' };

    if (now === before + bani(input.value)) {
        const probableNumber =
            input.expectedNumber !== null && input.nextNumberNow !== null && input.nextNumberNow === input.expectedNumber + 1 ? input.expectedNumber : null;
        return {
            outcome: 'needs_review',
            probableNumber,
            reason:
                probableNumber !== null
                    ? `Răspunsul SmartBill s-a pierdut, iar pe factură s-a încasat exact suma asta, probabil cu chitanța ${probableNumber}. Verifică în SmartBill și confirmă.`
                    : 'Răspunsul SmartBill s-a pierdut, iar pe factură s-a încasat exact suma asta. Verifică în SmartBill și confirmă.',
        };
    }

    return {
        outcome: 'needs_review',
        probableNumber: null,
        reason: `Răspunsul SmartBill s-a pierdut, iar suma încasată pe factură s-a schimbat altfel decât cu plata asta (de la ${lei(input.expectedPaid)} la ${lei(input.paidNow)}). Verifică în SmartBill.`,
    };
}

function figure(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
}

function bani(lei: number): number {
    return Math.round(lei * 100);
}

function lei(value: number): string {
    return `${value.toFixed(2).replace('.', ',')} lei`;
}
