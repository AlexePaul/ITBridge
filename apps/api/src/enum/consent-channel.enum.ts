/**
 * Whose hands wrote a consent down, or its withdrawal — E07 S2.
 *
 * The decision is always the family's. What differs is who pressed the button: `portal` is the
 * parent, in their own session; `office` is the school transcribing — a form the family signed on
 * paper, or a withdrawal asked for on the phone. Families without an account can only be served the
 * second way, and a family with one can use either.
 *
 * It is on the row, and not only in the audit trail, because the family reads it: the export and
 * the portal say "din portal" or "consemnat de birou", and a consent the family does not remember
 * giving is exactly the one they should be able to see was typed in by somebody else.
 */
export enum ConsentChannel {
    PORTAL = 'portal',
    OFFICE = 'office',
}
