import { outstandingDocuments } from './legal-acceptance.rules';
import { LEGAL_DOCUMENT_VERSIONS } from './legal-documents';
import { LegalDocument } from 'src/enum/legal-document.enum';

/** Every document, in the version in force today — a family that has just registered. */
const allCurrent = () =>
    (Object.keys(LEGAL_DOCUMENT_VERSIONS) as LegalDocument[]).map((document) => ({
        document,
        version: LEGAL_DOCUMENT_VERSIONS[document],
    }));

describe('outstandingDocuments', () => {
    it('has nothing to ask of a family that accepted every document in the version in force', () => {
        expect(outstandingDocuments(allCurrent())).toEqual([]);
    });

    it('asks for every document when the ledger is empty', () => {
        expect(outstandingDocuments([])).toEqual(Object.keys(LEGAL_DOCUMENT_VERSIONS));
    });

    it('asks again for the one document whose version has moved on', () => {
        const stale = allCurrent().map((row) => (row.document === LegalDocument.TERMS ? { ...row, version: '0.0' } : row));

        expect(outstandingDocuments(stale)).toEqual([LegalDocument.TERMS]);
    });

    it('asks for the unusual clauses even when the terms themselves were accepted', () => {
        const accepted = allCurrent().filter((row) => row.document !== LegalDocument.UNUSUAL_CLAUSES);

        // Cod civil art. 1203: ticking the document does not accept the clauses inside it. If this
        // ever returns `[]`, a family has been recorded as accepting §14, §15 and §18 without
        // having been asked.
        expect(outstandingDocuments(accepted)).toEqual([LegalDocument.UNUSUAL_CLAUSES]);
    });

    it('keeps an older acceptance from counting for a newer version', () => {
        // The rule is set membership, not "is there any row for this document". A family that
        // accepted 0.0 and never saw 0.1 has to be asked, and the row from 0.0 stays in the ledger.
        const accepted = allCurrent().map((row) => ({ ...row, version: '0.0' }));

        expect(outstandingDocuments(accepted)).toEqual(Object.keys(LEGAL_DOCUMENT_VERSIONS));
    });

    it('counts a version the family did accept, whatever else is in the ledger beside it', () => {
        // A rollback: the document in force is one this family already accepted, on a day the
        // ledger records, with a newer row beside it. Asking again would be asking twice for the
        // same text.
        const accepted = [...allCurrent(), ...allCurrent().map((row) => ({ ...row, version: '0.9' }))];

        expect(outstandingDocuments(accepted)).toEqual([]);
    });
});
