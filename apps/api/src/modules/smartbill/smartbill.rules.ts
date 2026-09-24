import { formatLeiRo, romanianMonth } from 'src/modules/invoice/money-words';
import type { SmartBillConfig } from './smartbill.config';

/**
 * Everything about SmartBill that can be decided without a network — E16/S2.
 *
 * The shapes are the spec's (`InvoiceRequest`, `InvoiceResponseV2`, `SeriesResponse`), spelled
 * exactly: V1 does not ignore a field it does not know, it answers 400 `json_mapping_error`, so a
 * typo here is a refused invoice rather than a quietly missing value.
 */

export interface SmartBillCustomer {
    name: string;
    country: string;
    address?: string;
    isTaxPayer: boolean;
    saveToDb: boolean;
}

export interface SmartBillProduct {
    name: string;
    productDescription?: string;
    code?: string;
    quantity: number;
    price: number;
    measuringUnitName: string;
    currency: 'RON';
    isService: boolean;
    isTaxIncluded?: boolean;
    taxName?: string;
    taxPercentage?: number;
    saveToDb: boolean;
}

export interface SmartBillInvoiceRequest {
    companyVatCode: string;
    seriesName: string;
    isDraft: boolean;
    issueDate: string;
    dueDate: string;
    client: SmartBillCustomer;
    products: SmartBillProduct[];
    currency: 'RON';
    language: 'RO';
    precision: 2;
    mentions?: string;
    sendEmail: false;
}

/** What `POST /invoice/v2` answers on success, as the platform keeps it. */
export interface IssuedDocument {
    series: string | null;
    number: string | null;
    documentId: number | null;
    /** The edit page in SmartBill Cloud. Needs a SmartBill login, so it is for the office only. */
    documentUrl: string | null;
    /** The public PDF: "il trimiti clientului final fara sa necesite autentificare". */
    documentViewUrl: string | null;
}

export interface SeriesEntry {
    name: string;
    nextNumber: number;
    type: 'f' | 'p' | 'c';
}

export interface TaxEntry {
    name: string;
    percentage: number;
}

/**
 * Why a call did not produce what was asked. The four kinds are four different next steps, and the
 * whole point of naming them is that only one of them may ever lead to sending the same invoice
 * again without a look first.
 */
export type SmartBillFailureKind =
    /**
     * SmartBill understood and said no: a missing series, a VAT rate the account does not have, the
     * subscription's document limit. **Nothing was issued.** Asking again with the same payload gets
     * the same no, so the invoice waits for a person — who fixes the cause and presses retry.
     */
    | 'refused'
    /**
     * The credentials or the rights: 401, or a 403 that is not the rate limit ("Nu aveti dreptul de
     * a adauga facturi pe seria selectata"). Nothing was issued, and the invoice did nothing wrong —
     * so it keeps its place and its attempts, the way the outbox does for a missing mail key.
     */
    | 'configuration'
    /**
     * The rate limit. "30 apeluri la 10 secunde per token. La depasire, accesul este blocat timp de
     * 10 minute." Nothing was issued; every call for the next ten minutes is wasted, and on V3 at
     * least the penalty grows with each one — so nothing is sent until the lock has passed.
     */
    | 'throttled'
    /**
     * No answer, or a 5xx: the request may or may not have become an invoice. This is the one case
     * where "try again" can mean two invoices for one month, so it is never retried blind —
     * `reconcile` decides, from the series, whether anything was issued.
     */
    | 'ambiguous';

export class SmartBillError extends Error {
    constructor(
        readonly kind: SmartBillFailureKind,
        message: string,
        readonly status: number | null = null,
    ) {
        super(message);
        this.name = 'SmartBillError';
    }
}

/** Kept off the row and out of the log: SmartBill can answer with a whole nginx page. */
const MAX_ERROR_LENGTH = 500;

/**
 * The cause, as a sentence.
 *
 * `errorText` "poate contine HTML" — a `<br/>` before a suggestion, `<b>` around the document or
 * product name, a hidden `<div id="moreErrorDetails">` of help text — and the spec's own advice is
 * to keep the first sentence, up to the first `<`. That drops the name inside a `<b>`, which is the
 * one piece worth keeping, so the markup inside the sentence is stripped instead and only the help
 * appended after it is cut. An HTML *page* (the 502 from `/invoice/pdf`) carries no sentence at all.
 */
export function sanitizeErrorText(raw: string): string {
    if (/^\s*<(!doctype|html)/i.test(raw)) return '';
    const withoutHelp = raw.replace(/<div[^>]*id="moreErrorDetails".*$/is, '').replace(/<br\s*\/?>.*$/is, '');
    return withoutHelp
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_ERROR_LENGTH);
}

function stringField(body: unknown, field: string): string {
    if (typeof body !== 'object' || body === null) return '';
    const value = (body as Record<string, unknown>)[field];
    return typeof value === 'string' ? value : '';
}

/**
 * The `invalid_request_error` envelope — a field name SmartBill did not recognise, or a value of the
 * wrong type. It has no `errorText`; the cause is in `errors[].param`, which the spec says to read.
 */
function requestErrorText(body: unknown): string {
    if (typeof body !== 'object' || body === null) return '';
    const errors = (body as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) return '';
    return errors
        .map((entry: unknown) => {
            const message = stringField(entry, 'message');
            const param = stringField(entry, 'param');
            return param ? `${message} (${param})` : message;
        })
        .filter(Boolean)
        .join('; ');
}

/** The one line a person reads about a failure: SmartBill's own words when there are any. */
export function describeFailure(status: number | null, body: unknown): string {
    const text = sanitizeErrorText(stringField(body, 'errorText')) || sanitizeErrorText(requestErrorText(body));
    if (text) return text;
    return status === null ? 'SmartBill did not answer' : `SmartBill answered HTTP ${status}`;
}

/**
 * The lock-out, as it is observed rather than as it is documented.
 *
 * The spec lists 429. A client library that runs against the live API records that the V1 breach is
 * a **403** whose `errorText` names the limit ("Ai depasit limita maxima de requesturi admisa...").
 * Both are accepted. A 403 alone is not enough: the same status also means "no rights on this
 * series", which a ten-minute pause would not fix.
 */
export function isLockout(status: number, body: unknown): boolean {
    if (status === 429) return true;
    return status === 403 && /limita maxima de requesturi/i.test(stringField(body, 'errorText'));
}

/**
 * Sorts a response that did not succeed.
 *
 * `status` is `null` when there was no response at all — a timeout, a dropped connection. The
 * order matters: the lock-out is a 403, so it is recognised before the 403 that means rights.
 *
 * **A 2xx with `errorText` filled is a refusal**, not a success: "campul errorText este sursa de
 * adevar pentru cauza erorii - daca e gol apelul a reusit". Only a 5xx or silence leaves the
 * outcome open, and 500 is kept open even though the spec's own 500 example (a `null` CIF) is a
 * refusal: a server error is the one answer that can arrive after the document was written.
 */
export function classifyFailure(status: number | null, body: unknown): SmartBillFailureKind {
    if (status === null) return 'ambiguous';
    if (isLockout(status, body)) return 'throttled';
    if (status === 401 || status === 403) return 'configuration';
    if (status >= 500) return 'ambiguous';
    return 'refused';
}

/** True when a response is the success envelope: 2xx and an empty `errorText`. */
export function isSuccess(status: number, body: unknown): boolean {
    return status >= 200 && status < 300 && stringField(body, 'errorText').trim() === '';
}

/** Reads the parts of `InvoiceResponseV2` the platform keeps. Empty strings and `-1` become `null`. */
export function readIssuedDocument(body: unknown): IssuedDocument {
    const text = (field: string) => stringField(body, field).trim() || null;
    const id = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).documentId : undefined;
    return {
        series: text('series'),
        number: text('number'),
        documentId: typeof id === 'number' && id > 0 ? id : null,
        documentUrl: text('documentUrl'),
        documentViewUrl: text('documentViewUrl'),
    };
}

export interface FiscalInvoiceInput {
    /** The platform's own id, printed on the document so either side can find the other. */
    invoiceId: number;
    /** What the family owes, after the month's discounts — the one number the document must carry. */
    amount: number;
    /** `YYYY-MM-DD`, the day printed on the invoice. */
    issueDate: string;
    /** `YYYY-MM-DD`, fourteen days on — the term `arrears.rules.ts` holds every family to. */
    dueDate: string;
    monthIssued: string;
    client: { name: string; address: string | null };
    /** Already applied to `amount`; listed so the document says why the number is what it is. */
    discounts: { name: string; type: 'fixed' | 'percent'; value: number }[];
}

/**
 * A discount as the document names it: lei for a fixed one, a percentage for the other. Not a
 * computed lei figure for the percentage — that needs the list price, which the invoice does not
 * keep, and a mention that states the rule cannot disagree with the total the way a recomputed sum
 * could.
 */
export function describeDiscount(discount: FiscalInvoiceInput['discounts'][number]): string {
    const amount = discount.type === 'percent' ? `${String(discount.value).replace('.', ',')}%` : formatLeiRo(discount.value);
    return `Include reducerea „${discount.name}”: −${amount}.`;
}

/**
 * The request for one month's invoice.
 *
 * **One line, at the amount the platform computed.** Not the list price with discount lines under
 * it, though SmartBill has them: its discount lines have traps the spec spells out — a positive
 * `discountValue` *raises* the total, a line without `numberOfItems` is "ignorat in silentiu" with
 * a 200 — and with a VAT-inclusive price the arithmetic is SmartBill's, not ours. E15/S7's promise
 * is that the portal and SmartBill agree to the leu; a single line at `amount` makes that true by
 * construction. The discount is still on the document, in `mentions`, in words: a net unit price is
 * a legal invoice, and the family can still read why the month cost less.
 *
 * **Name and address, nothing else about the family** — E16's decision, and GDPR's minimisation:
 * no e-mail, no phone. `sendEmail` is false because the family hears from the platform through the
 * outbox (E17), never through a second channel `/admin/livrari` cannot see. `saveToDb` is false on
 * both the client and the product so the platform writes nothing into SmartBill's nomenclatures.
 */
export function invoicePayload(input: FiscalInvoiceInput, config: SmartBillConfig, isDraft: boolean): SmartBillInvoiceRequest {
    const product: SmartBillProduct = {
        name: `Servicii educaționale — ${romanianMonth(input.monthIssued)} ${input.monthIssued.slice(0, 4)}`,
        productDescription: 'Cursuri IT pentru copii, luna de curs facturată',
        quantity: 1,
        price: input.amount,
        measuringUnitName: config.measuringUnit,
        currency: 'RON',
        isService: true,
        saveToDb: false,
        ...(config.productCode ? { code: config.productCode } : {}),
        ...(config.tax ? { isTaxIncluded: true, taxName: config.tax.name, taxPercentage: config.tax.percentage } : {}),
    };

    const mentions = [`Nr. intern ITBridge: ${input.invoiceId}.`, ...input.discounts.map(describeDiscount)].join(' ');

    return {
        companyVatCode: config.cif ?? '',
        seriesName: config.invoiceSeries ?? '',
        isDraft,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        client: {
            name: input.client.name,
            country: 'Romania',
            ...(input.client.address ? { address: input.client.address } : {}),
            isTaxPayer: false,
            saveToDb: false,
        },
        products: [product],
        currency: 'RON',
        language: 'RO',
        precision: 2,
        mentions,
        sendEmail: false,
    };
}

/**
 * What an unanswered request left behind, decided from the series — E16/S2's acceptance.
 *
 * SmartBill has no idempotency key, so "did my request become an invoice?" cannot be asked of the
 * request. It can be asked of the series: `nextNumber` was read just before the request was sent
 * and written onto the row (`fiscalExpectedNumber`), and a series only moves when a document is
 * issued on it. So:
 *
 *  - **no expected number** — the request was never sent: the number is written *before* the call,
 *    so a row without one crashed on the way to it. Safe to send.
 *  - **unchanged** — nothing was issued. Safe to send again, and this is the case that is decided
 *    without anybody: a series that did not move cannot hold our invoice.
 *  - **moved** — something was issued, almost certainly ours at `expected` when it moved by one. But
 *    "almost certainly" is not the bar for a fiscal record: the platform does not adopt a number it
 *    did not see come back. A person looks in SmartBill and confirms, or says it is not there.
 *
 * The series must be the platform's own for the second case to hold: an invoice typed by hand on
 * the same series would move it too, and turn a request that never arrived into a question.
 */
export type Reconciliation = { outcome: 'not_sent' } | { outcome: 'not_created' } | { outcome: 'needs_review'; probableNumber: number | null; reason: string };

export function reconcile(expectedNumber: number | null, nextNumber: number): Reconciliation {
    if (expectedNumber === null) return { outcome: 'not_sent' };
    if (nextNumber === expectedNumber) return { outcome: 'not_created' };
    if (nextNumber === expectedNumber + 1) {
        return {
            outcome: 'needs_review',
            probableNumber: expectedNumber,
            reason: `Seria a trecut de la ${expectedNumber} la ${nextNumber} în timp ce cererea era fără răspuns: factura a fost probabil emisă cu numărul ${expectedNumber}.`,
        };
    }
    return {
        outcome: 'needs_review',
        probableNumber: null,
        reason: `Seria a trecut de la ${expectedNumber} la ${nextNumber} în timp ce cererea era fără răspuns — s-a mai emis ceva pe ea, deci numărul nu se poate deduce.`,
    };
}

/**
 * The number SmartBill will give the next invoice, re-anchored on the one it just gave.
 *
 * The series is read once per pass rather than before every request — half the calls against a
 * limit of thirty per ten seconds — and each success moves the expectation to one past the number
 * that came back, which is SmartBill's own word rather than a count kept here. A number that does
 * not parse leaves `null`, and the next request reads the series afresh.
 */
export function nextExpectedAfter(issuedNumber: string | null): number | null {
    if (!issuedNumber) return null;
    const parsed = Number.parseInt(issuedNumber, 10);
    return Number.isFinite(parsed) ? parsed + 1 : null;
}
