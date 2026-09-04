import { createHash } from 'crypto';
import { foldDiacritics } from 'src/common/fold-diacritics';
import { schoolDay } from 'src/common/school-clock';

/**
 * The lines E20 draws, in one file, as plain functions — E20/S2 and S3.
 *
 * Separate from the service for the reason the rest of this codebase separates them: a threshold
 * that lives inside a service can only be tested by standing a database up behind it, so in
 * practice it stops being tested at all.
 */

/**
 * How long a lead may sit with nobody touching it before the office is told.
 *
 * S3's acceptance names seven days. It is a constant rather than a setting because moving it is a
 * decision about how the school answers families, not a knob — and because a configurable
 * threshold is one somebody eventually raises to silence the reminder.
 */
export const STALE_LEAD_DAYS = 7;

/**
 * How far ahead the booking form offers classes.
 *
 * The timetable itself is written eight weeks out (E12/S1), but a parent choosing a trial four
 * weeks from now is not choosing a trial. Three weeks is enough to skip a holiday and short enough
 * that the seat held is a seat about to be used.
 */
export const TRIAL_HORIZON_DAYS = 21;

/**
 * Whole calendar days between two instants, on the school's clock.
 *
 * Calendar days, not elapsed hours — the same rule and the same reason as `daysWaiting` in
 * E17/S8: a lead that arrived yesterday at 18:00 and is read this morning at 09:00 has been waiting
 * a day, and somebody reading "de 3 zile" is counting mornings nobody looked, not blocks of 72
 * hours. Comparing the two school days rather than subtracting instants is also what keeps the
 * answer from changing with the server's time zone.
 */
export function daysSince(then: Date, now: Date = new Date()): number {
    const start = Date.parse(`${schoolDay(then)}T00:00:00Z`);
    const end = Date.parse(`${schoolDay(now)}T00:00:00Z`);
    return Math.max(0, Math.round((end - start) / 86_400_000));
}

/** A lead nobody has touched for a week, and which is not already finished. */
export function isStale(lastActivityAt: Date, now: Date = new Date()): boolean {
    return daysSince(lastActivityAt, now) >= STALE_LEAD_DAYS;
}

/**
 * What makes two presses of the public form the same booking.
 *
 * The child, the class and the family — not the wording, and not the moment. A parent who books a
 * second trial for a **second** child gets a different key, because the name and the birth date are
 * in it; the same parent pressing send twice on a slow phone gets the same one, and the unique index
 * refuses the second before it can take a seat.
 *
 * Folded the way the announcement check folds names: case and diacritics removed, so "Ştefan" and
 * "stefan" are one child rather than two.
 */
export function bookingKeyFor(input: { childFirstName: string; childBirthDate: string; classSessionId: number | null; contact: string }): string {
    const fold = (value: string) => foldDiacritics(value.trim());

    const parts = [fold(input.childFirstName), input.childBirthDate, String(input.classSessionId ?? 'none'), fold(input.contact)];
    return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 64);
}
