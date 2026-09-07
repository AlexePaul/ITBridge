/**
 * The documents a parent accepts when the account is created — E22 S2, recorded by S4.
 *
 * Two, not one, although a single checkbox covers both: they are different things in law. The
 * terms are a contract and are *accepted*; the privacy notice is information and is *acknowledged*
 * — nothing in it rests on consent, so nothing in it could be withdrawn by unticking. Each gets its
 * own row with its own version, so "which version of which document did this family see" keeps an
 * answer per document when the two move at different times.
 */
export enum LegalDocument {
    TERMS = 'terms',
    PRIVACY = 'privacy',
}
