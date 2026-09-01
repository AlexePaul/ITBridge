/**
 * Why a message had nowhere to go — E17/S5.
 *
 * Named `DeliveryFailureReason`, not `UndeliverableReason`, because E14's send report already owns
 * that name for the same two cases in different words (`no_email` / `email_unconfirmed`). These are
 * the story's own words — „fără adresă" and „adresă neconfirmată" — and they are the canonical pair;
 * E14's report keeps its vocabulary until somebody touches it, and the divergence is written down in
 * the epic rather than left to be discovered.
 *
 * Two values, not one, because they look identical in a list — a parent who did not receive
 * something — and are resolved completely differently: the first needs a phone call, the second a
 * resent confirmation link. A single "no recipient" would put both in the same bucket and leave the
 * admin to guess which action applies.
 */
export enum DeliveryFailureReason {
    /** `Profile.email` is empty — a family an admin typed in from a phone call, never completed. */
    NO_ADDRESS = 'no_address',
    /** There is an address, but nobody has opened the confirmation link (E11/S2). */
    UNCONFIRMED_ADDRESS = 'unconfirmed_address',
}
