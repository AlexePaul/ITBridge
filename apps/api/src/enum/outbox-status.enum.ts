/**
 * Where a queued message is in its life.
 *
 * There is deliberately no `sending` state. The scheduler claims rows with
 * `SELECT … FOR UPDATE SKIP LOCKED`, so the row lock *is* the claim: a second pass cannot see a
 * row a first pass is holding, and a crash releases the lock with the transaction instead of
 * leaving a row stranded in `sending` that somebody has to unstick by hand.
 */
export enum OutboxStatus {
    /** Waiting for its turn, or waiting out the backoff after a failed attempt. */
    PENDING = 'pending',
    /** The provider accepted it. `sentAt` says when. */
    SENT = 'sent',
    /**
     * Given up on after the attempt limit. The row stays — E17/S5 requires a permanent failure to
     * remain visible in the delivery record rather than disappearing into a log.
     */
    FAILED = 'failed',
}
