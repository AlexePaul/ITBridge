/**
 * The documents a parent accepts when the account is created — E22 S2, recorded by S4.
 *
 * Three, not one, although the reader sees two checkboxes: they are different things in law. The
 * terms are a contract and are *accepted*; the privacy notice is information and is *acknowledged*
 * — nothing in it rests on consent, so nothing in it could be withdrawn by unticking. Each gets its
 * own row with its own version, so "which version of which document did this family see" keeps an
 * answer per document when the two move at different times.
 *
 * The third is not a document of its own but a set of clauses inside the terms — §14 suspension,
 * §15 limited liability, §18 unilateral amendment — which Cod civil art. 1203 calls unusual and
 * which produce no effect unless they are accepted **expressly and separately**. A general "I have
 * read the terms" does not accept them, so a second tick does, and it is recorded as its own row.
 * Its version is the terms' version, because that is what it is a part of: `LEGAL_DOCUMENT_FILES`
 * points both at the same file, and the spec that keeps the constants honest checks both against it.
 */
export enum LegalDocument {
    TERMS = 'terms',
    PRIVACY = 'privacy',
    UNUSUAL_CLAUSES = 'unusual_clauses',
}
