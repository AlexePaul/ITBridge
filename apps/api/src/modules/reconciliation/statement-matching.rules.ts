/**
 * Which invoice a line of the bank statement pays — E16/S8: "potrivire automată după sumă, dată și
 * referință; ce nu se potrivește ajunge într-o coadă pentru decizie umană".
 *
 * Pure, and a **proposal**, never a decision: a line becomes a payment only when somebody confirms
 * it, one by one or all the sure ones at once. Two rules, in order of how much they can be trusted:
 *
 *  1. **The reference.** The portal asks every family to write the fiscal invoice's series and
 *     number in the transfer's details (E16/S4's note), and a line that names exactly one open
 *     invoice that way is paying that invoice. `ITB 0041`, `ITB0041`, `ITB-41` and `itb 41` are the
 *     same reference; `ITB 410` is not.
 *  2. **The name and the sum.** No reference, but the payer is a family with an open invoice of
 *     exactly that sum left to pay. Weaker — a grandparent pays under another name, two families
 *     share one — so it is proposed but never confirmed in bulk.
 *
 * Anything else — two references, a name that fits two families, a sum that fits nothing — is left
 * to a person. A wrong automatic match is money recorded against the wrong family, and a reminder
 * sent to the right one.
 */

export interface OpenInvoice {
    invoiceId: number;
    monthIssued: string;
    /** What is left to pay: the arrears list's figure, never a second subtraction. */
    outstanding: number;
    fiscalSeries: string | null;
    fiscalNumber: string | null;
    family: { parentId: number; firstName: string; lastName: string };
}

export interface StatementLineForMatching {
    amount: number;
    description: string;
    counterparty: string | null;
}

export type MatchConfidence = 'reference' | 'name';

export interface MatchSuggestion {
    invoiceId: number;
    confidence: MatchConfidence;
    /** The line pays more than is left: the rest goes on the invoice as an advance, which a person may not want. */
    overpays: boolean;
}

/** Upper case, no diacritics, anything but letters and digits as one space. */
export function normalizeText(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .trim();
}

/** Whether the text names this fiscal invoice: its series, then its number with any leading zeros. */
export function namesInvoice(normalizedText: string, series: string, number: string): boolean {
    const numeric = Number.parseInt(number, 10);
    if (!Number.isFinite(numeric)) return false;
    const seriesPattern = normalizeText(series).replace(/\s+/g, '\\s*');
    if (!seriesPattern) return false;
    return new RegExp(`(^|\\s)${seriesPattern}\\s*0*${numeric}(\\s|$)`).test(normalizedText);
}

export function suggestMatch(line: StatementLineForMatching, open: OpenInvoice[]): MatchSuggestion | null {
    const text = normalizeText(`${line.counterparty ?? ''} ${line.description}`);

    // Rule 1: exactly one open invoice named by its fiscal number.
    const referenced = open.filter((invoice) => invoice.fiscalSeries && invoice.fiscalNumber && namesInvoice(text, invoice.fiscalSeries, invoice.fiscalNumber));
    if (referenced.length === 1) {
        const invoice = referenced[0];
        return { invoiceId: invoice.invoiceId, confidence: 'reference', overpays: bani(line.amount) > bani(invoice.outstanding) };
    }
    if (referenced.length > 1) return null; // one transfer for two invoices: a person splits it

    // Rule 2: a family named in the line, with exactly one open invoice of exactly this sum.
    const words = new Set(text.split(' '));
    const named = families(open).filter((family) => {
        const last = normalizeText(family.lastName)
            .split(' ')
            .filter((word) => word.length >= 3);
        if (last.length === 0 || !last.every((word) => words.has(word))) return false;
        const first = normalizeText(family.firstName).split(' ')[0];
        const sameLastName = families(open).filter((other) => normalizeText(other.lastName) === normalizeText(family.lastName));
        // The first name is needed only when the last name alone does not say which family.
        return sameLastName.length === 1 || (first !== undefined && first.length >= 2 && words.has(first));
    });
    if (named.length !== 1) return null;

    const exact = open.filter((invoice) => invoice.family.parentId === named[0].parentId && bani(invoice.outstanding) === bani(line.amount));
    if (exact.length !== 1) return null;
    return { invoiceId: exact[0].invoiceId, confidence: 'name', overpays: false };
}

function families(open: OpenInvoice[]): OpenInvoice['family'][] {
    const byParent = new Map<number, OpenInvoice['family']>();
    for (const invoice of open) byParent.set(invoice.family.parentId, invoice.family);
    return [...byParent.values()];
}

/**
 * The sure matches judged together, in the order the money arrived.
 *
 * `suggestMatch` judges one line against what its invoice has left, so two lines that cite the same
 * invoice — a family that paid twice, 200 and 200 on 350, or one transfer imported twice after its
 * text drifted — each fitted on its own, and one press of "confirm the sure matches" recorded both:
 * 700 or 400 on an invoice of 350, and in `live` the second collection went to SmartBill too. Here
 * each line counts against what the lines before it left, oldest first, and one that no longer fits
 * is an overpayment — which a person decides, as any other is.
 *
 * Only `reference` suggestions take part: they are the ones confirmed in bulk. A `name` suggestion
 * is confirmed one at a time, and the page is read again after each.
 */
export function withRunningRemainder(
    lines: { id: number; bookedOn: string; amount: number }[],
    suggestions: Map<number, MatchSuggestion | null>,
    open: OpenInvoice[],
): Map<number, MatchSuggestion | null> {
    const left = new Map(open.map((invoice) => [invoice.invoiceId, bani(invoice.outstanding)]));
    const judged = new Map(suggestions);
    const oldestFirst = [...lines].sort((a, b) => a.bookedOn.localeCompare(b.bookedOn) || a.id - b.id);
    for (const line of oldestFirst) {
        const suggestion = suggestions.get(line.id);
        if (!suggestion || suggestion.confidence !== 'reference' || suggestion.overpays) continue;
        const remaining = left.get(suggestion.invoiceId) ?? 0;
        if (bani(line.amount) > remaining) {
            judged.set(line.id, { ...suggestion, overpays: true });
        } else {
            left.set(suggestion.invoiceId, remaining - bani(line.amount));
        }
    }
    return judged;
}

function bani(lei: number): number {
    return Math.round(lei * 100);
}
