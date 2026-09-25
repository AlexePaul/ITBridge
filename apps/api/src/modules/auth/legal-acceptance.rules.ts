import { LegalDocument } from 'src/enum/legal-document.enum';
import { LEGAL_DOCUMENT_VERSIONS } from './legal-documents';

/** One row of the ledger, reduced to what the rule needs. */
export interface AcceptedDocument {
    document: LegalDocument;
    version: string;
}

/**
 * Which documents the family has not accepted **in the version that is in force today** — E22 S4,
 * second half. Terms §18 promises this: at the first sign-in after a new version, the portal asks.
 *
 * Set membership, not "the newest row is out of date". The two agree whenever versions only ever
 * move forward, and the difference is what happens when one does not: a document rolled back to a
 * version this family already accepted would read as outstanding under a comparison and does not
 * here, which is the truthful answer — they did accept that text, on a day the ledger records.
 * There is no ordering to get wrong, and none has to be stored.
 *
 * Order follows `LEGAL_DOCUMENT_VERSIONS`, so the screen lists the terms before the clauses inside
 * them however the rows came back from the database.
 */
export function outstandingDocuments(accepted: readonly AcceptedDocument[]): LegalDocument[] {
    const inForce = new Set(accepted.map((row) => `${row.document}@${row.version}`));

    return (Object.keys(LEGAL_DOCUMENT_VERSIONS) as LegalDocument[]).filter((document) => !inForce.has(`${document}@${LEGAL_DOCUMENT_VERSIONS[document]}`));
}

/**
 * How the confirmation of terms §4.7 names each document — Romanian, since it lands in a family's
 * inbox. The clauses carry no version of their own: they are §14, §15 and §18 of the terms, so they
 * are the terms' version, and saying so twice in one sentence would read as two numbers to check.
 */
const IN_WORDS: Record<LegalDocument, () => string> = {
    [LegalDocument.TERMS]: () => `Termenii și condițiile, versiunea ${LEGAL_DOCUMENT_VERSIONS[LegalDocument.TERMS]}`,
    [LegalDocument.UNUSUAL_CLAUSES]: () => 'separat, clauzele de la §14, §15 și §18 din termeni — suspendarea, limitarea răspunderii și modificarea termenilor',
    [LegalDocument.PRIVACY]: () => `Politica de confidențialitate, versiunea ${LEGAL_DOCUMENT_VERSIONS[LegalDocument.PRIVACY]}`,
};

/** Reading order, not ledger order: the clauses right after the terms they are part of. */
const READING_ORDER: readonly LegalDocument[] = [LegalDocument.TERMS, LegalDocument.UNUSUAL_CLAUSES, LegalDocument.PRIVACY];

/**
 * What one act of acceptance accepted, as the single sentence the template carries — terms §4.7.
 *
 * One variable rather than three, because templates have no conditionals (E17 S2) and the list
 * varies: a registration accepts everything, a re-acceptance only what moved. A confirmation that
 * named the terms when only the privacy notice changed would tell the family they accepted, on
 * that day, a text they accepted months earlier — which is the one thing this message must not
 * get wrong.
 */
export function acceptedInWords(documents: readonly LegalDocument[]): string {
    const written = new Set(documents);
    return READING_ORDER.filter((document) => written.has(document))
        .map((document) => IN_WORDS[document]())
        .join('; ');
}
