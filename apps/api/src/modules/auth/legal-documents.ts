import { LegalDocument } from 'src/enum/legal-document.enum';

/**
 * The version of each document a registration accepts today — E22 S2/S4.
 *
 * The documents themselves live in `docs/legal/`, as Markdown, and carry their version in the
 * first bold line; the public pages render that same file, so the reader sees the version this
 * constant names. The backend cannot read the file at runtime — `dist/` ships without `docs/` —
 * so the number is copied here, and `legal-documents.spec.ts` fails the moment the two disagree.
 * Bump the document, run the tests, bump this: that is the whole procedure — with one step before
 * it once a version has been published. Terms §4.7 promises the family can re-read the version
 * they accepted from the portal, so the text being replaced is kept first, verbatim, in
 * `docs/legal/versiuni/`, and `/versiuni/<document>/<version>` serves it. The web suite holds the
 * step (`legal-versions.spec.ts`): a published text cannot change under its number, and a replaced
 * one cannot go without being kept — `docs/legal/versiuni/README.md` has the commands.
 */
export const LEGAL_DOCUMENT_VERSIONS: Record<LegalDocument, string> = {
    [LegalDocument.TERMS]: '0.2',
    [LegalDocument.PRIVACY]: '0.3',
    // The unusual clauses are §14, §15 and §18 of the terms, so they move when the terms move.
    [LegalDocument.UNUSUAL_CLAUSES]: '0.2',
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
