import { LegalDocument } from 'src/enum/legal-document.enum';

/**
 * The version of each document a registration accepts today — E22 S2/S4.
 *
 * The documents themselves live in `docs/legal/`, as Markdown, and carry their version in the
 * first bold line; the public pages render that same file, so the reader sees the version this
 * constant names. The backend cannot read the file at runtime — `dist/` ships without `docs/` —
 * so the number is copied here, and `legal-documents.spec.ts` fails the moment the two disagree.
 * Bump the document, run the tests, bump this: that is the whole procedure.
 */
export const LEGAL_DOCUMENT_VERSIONS: Record<LegalDocument, string> = {
    [LegalDocument.TERMS]: '0.1',
    [LegalDocument.PRIVACY]: '0.1',
    // The unusual clauses are §14, §15 and §18 of the terms, so they move when the terms move.
    [LegalDocument.UNUSUAL_CLAUSES]: '0.1',
};

/** The file behind each document, relative to `docs/legal/`. */
export const LEGAL_DOCUMENT_FILES: Record<LegalDocument, string> = {
    [LegalDocument.TERMS]: 'termeni-si-conditii.md',
    [LegalDocument.PRIVACY]: 'politica-de-confidentialitate.md',
    [LegalDocument.UNUSUAL_CLAUSES]: 'termeni-si-conditii.md',
};

/**
 * What one registration accepts, in the order the rows are written.
 *
 * Every document there is, which is why nothing else in the codebase iterates this constant to
 * decide what is outstanding — `outstandingDocuments` walks `LEGAL_DOCUMENT_VERSIONS` instead. The
 * two lists agree today and there is no reason for them to diverge; if a fourth document ever
 * arrives that a registration does not accept, this one shrinks and that one must not.
 */
export const ACCEPTED_AT_REGISTRATION: readonly LegalDocument[] = [LegalDocument.TERMS, LegalDocument.PRIVACY, LegalDocument.UNUSUAL_CLAUSES];
