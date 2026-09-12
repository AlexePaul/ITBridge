/**
 * When a queued message stops being "on its way" and becomes "not going" — E17/S5.
 *
 * Next to the service rather than inside a `WHERE`, for the reason `pending.rules.ts` and
 * `arrears.rules.ts` both exist: a threshold buried in a query is a threshold nobody remembers
 * agreeing to.
 *
 * The queue has two terminal failures and one silent one. `failed` and `undeliverable` are states
 * the row carries; the third is not a state at all, and that is exactly why it was invisible — a
 * message waiting for a dispatcher that is not running looks, from the table, identical to one
 * waiting out its backoff.
 */

/**
 * How far past due a pending message must be before it counts as stuck.
 *
 * Fifteen minutes, and the number comes from the dispatcher rather than from taste:
 * `POLL_INTERVAL_MS` is thirty seconds, so fifteen minutes is **thirty missed ticks**. A healthy
 * pass claims a due message on the next tick, so nothing that is merely waiting out a backoff can
 * reach this line — `nextAttemptAt` is the moment it became due, not the moment it was written.
 *
 * It is generous on purpose. A slow provider, a long pass or a burst all delay a message by
 * seconds; only something structural delays it by a quarter of an hour. Two structural things do,
 * and both want a human:
 *
 * - **Nothing is claiming.** The process is down, `MAIL_OUTBOX_ENABLED` is off, or the
 *   `@Interval` never armed. Messages accumulate and nothing anywhere says so.
 * - **The queue cannot keep up.** A pass claims `DEFAULT_BATCH_SIZE` (25) every thirty seconds —
 *   three thousand an hour — so reaching this line by volume means a backlog over seven hundred
 *   deep, which for a school this size is itself the news.
 *
 * Exposed on the wire beside the figure, like `STALE_PENDING_DAYS`, so the screen can say which
 * line it draws instead of hardcoding a second copy of it.
 */
export const STUCK_AFTER_MINUTES = 15;

/** The instant a pending message must have been due by to count as stuck. */
export function stuckBefore(now: Date): Date {
    return new Date(now.getTime() - STUCK_AFTER_MINUTES * 60_000);
}

/** What the queue could not deliver, and what it has not delivered when it should have. */
export interface OutboxHealth {
    /** Given up on: the provider refused permanently, or the attempt budget ran out. */
    failed: number;
    /** Never attempted: no address on file, or one nobody has confirmed. */
    undeliverable: number;
    /** Due to go and still sitting there. Not a status — a clock. */
    stuck: number;
    /** The line `stuck` is drawn at, so the screen names it rather than repeating it. */
    stuckAfterMinutes: number;
}
