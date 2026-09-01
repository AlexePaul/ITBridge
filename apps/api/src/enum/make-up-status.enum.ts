/**
 * The life of one make-up entitlement — E12/S4.
 *
 * `EXPIRED` is derived on read, never stored: a credit expires by the calendar passing, not by
 * anybody doing anything, and a stored value would be wrong for exactly as long as nothing ran to
 * update it. It appears in this enum because it is a state a screen renders, not a row a writer
 * writes — see `MakeUpCreditService.statusOf`.
 */
export enum MakeUpStatus {
    /** Earned, not yet booked. The state a parent acts on. */
    AVAILABLE = 'available',
    /** Booked into a host session that has not happened yet. */
    BOOKED = 'booked',
    /** The child turned up and was marked. Spent. */
    CONSUMED = 'consumed',
    /** The validity window closed with the credit unspent. Derived, never written. */
    EXPIRED = 'expired',
}
