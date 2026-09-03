/**
 * How long a document may sit unsent before it stops being a queue and becomes a lapse — E17/S8.
 *
 * Next to the service rather than inside a query, for the reason `reports.rules.ts` and
 * `arrears.rules.ts` both exist: a threshold buried in a `WHERE` is a threshold nobody remembers
 * agreeing to.
 */

/**
 * Past this many days, a waiting document is shown as a problem rather than as a number.
 *
 * Two, and it is a **proposal** rather than a decision the owner has signed off. The reasoning: the
 * documents arrive on the day a class is taught, and every group meets weekly, so a document still
 * unsent when the next lesson is being prepared has missed the moment it belonged to. One day would
 * fire over a Friday upload looked at on Monday, which is not a lapse — it is a weekend.
 *
 * It is exposed on the wire next to the figures so the screen can say which line it is drawing, and
 * it lives here so moving that line is one edit.
 */
export const STALE_PENDING_DAYS = 2;

/**
 * Whole days between an upload and now, on calendar days rather than on elapsed hours.
 *
 * Calendar days because that is what the sentence on the screen means: an admin reading "de 3 zile"
 * is counting mornings they did not look, not 72-hour blocks. `Math.floor` on elapsed milliseconds
 * would call something uploaded yesterday at 18:00 and read this morning at 09:00 "0 days", which is
 * the opposite of the point.
 */
export function daysWaiting(uploadedAt: Date, now: Date): number {
    const startOfDay = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    const elapsed = startOfDay(now) - startOfDay(uploadedAt);
    return Math.max(0, Math.round(elapsed / 86_400_000));
}

/** True when the oldest waiting document has waited long enough to be worth a colour. */
export function isStale(oldestDays: number | null): boolean {
    return oldestDays !== null && oldestDays >= STALE_PENDING_DAYS;
}
