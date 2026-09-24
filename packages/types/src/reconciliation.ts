import type { ISODate, ISODateTime } from './common';
import type { PaymentStatus } from './payment';

/**
 * The bank statement against the platform — E16/S8. Mirrors the shapes in
 * `apps/api/src/modules/reconciliation/reconciliation.service.ts`.
 */

/** Waiting for a person, recorded as a payment, or set aside as not a family paying. */
export type StatementLineState = 'waiting' | 'matched' | 'ignored';

/** By the invoice's fiscal reference in the details (sure), or by the payer's name and the exact sum (a proposal). */
export type MatchConfidence = 'reference' | 'name';

/** `POST /reconciliation/statements`. */
export interface StatementImportResult {
    credits: number;
    imported: number;
    /** Lines an earlier import already brought in. */
    duplicates: number;
    debits: number;
    unreadable: { row: number; reason: string }[];
    /** The header cells the reader used, as the file wrote them. */
    columns: {
        date: string;
        amount: string;
        description: string | null;
        counterparty: string | null;
        reference: string | null;
    };
    suggested: number;
    suggestedByReference: number;
}

export interface StatementLineSuggestion {
    invoiceId: number;
    confidence: MatchConfidence;
    /** Pays more than is left on the invoice. */
    overpays: boolean;
    familyName: string;
    monthIssued: string;
    fiscalSeries: string | null;
    fiscalNumber: string | null;
    outstanding: number;
}

export interface StatementLineView {
    id: number;
    bookedOn: ISODate;
    amount: number;
    description: string;
    counterparty: string | null;
    bankReference: string | null;
    state: StatementLineState;
    importedAt: ISODateTime;
    suggestion: StatementLineSuggestion | null;
    payment: { id: number; invoiceId: number; familyName: string; monthIssued: string; status: PaymentStatus } | null;
}

/** `GET /reconciliation/lines`. */
export interface StatementLinesPage {
    counts: Record<StatementLineState, number>;
    /** What "Confirmă potrivirile după referință" would record. */
    sureCount: number;
    lines: StatementLineView[];
}
