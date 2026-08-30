/**
 * The admin's verdict on a parent account — the second of the two gates from E11/S2.
 *
 * Deliberately separate from `User.emailConfirmedAt` rather than folded into one `status` column.
 * The two gates answer different questions and are decided by different people: confirming the
 * address proves the parent can be reached, approving the account proves the school knows the
 * family. They can also happen in either order — an admin who already spoke to the family on the
 * phone may approve before the link is ever opened. One enum holding both would have to encode
 * every combination, and the combinations it forgot would be the ones that occur.
 */
export enum ApprovalStatus {
    /** Registered, awaiting an admin. The state every parent account starts in. */
    PENDING = 'PENDING',
    /** An admin recognised the family. Necessary for an active account, not sufficient. */
    APPROVED = 'APPROVED',
    /** An admin refused it. Keeps the row, so the same person cannot quietly register again. */
    REJECTED = 'REJECTED',
}
