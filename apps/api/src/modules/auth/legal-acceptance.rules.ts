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
