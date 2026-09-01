import { addDays, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * How long a make-up credit lives — E12/S4.
 *
 * **Thirty days from the class that was missed.** The story asks for "un termen de valabilitate"
 * without naming one, and its acceptance sentence — „ai o recuperare disponibilă până pe 20
 * decembrie" — asks only that the date be concrete and sayable.
 *
 * Thirty days rather than a month-boundary rule, which was the other candidate: "until the end of
 * next month" gives a child who misses on the 2nd almost eight weeks and one who misses on the 30th
 * barely four, for no reason a parent would accept if it were explained to them. A fixed window is
 * the same promise to everybody.
 *
 * Long enough to contain four of the child's own weekly classes, so there is realistically a
 * compatible slot inside it; short enough that credits do not accumulate into a debt the school
 * cannot honour. If the school wants another number, this is the line.
 */
export const MAKE_UP_VALIDITY_DAYS = 30;

/** The last day a credit earned by missing `missedOn` can be used, inclusive. */
export function makeUpExpiryFor(missedOn: Date | string): Date {
    return addDays(typeof missedOn === 'string' ? parseIsoDate(missedOn.slice(0, 10)) : missedOn, MAKE_UP_VALIDITY_DAYS);
}

/** True when `day` is past the credit's last usable day. Both compared as local calendar dates. */
export function hasExpired(expiresOn: Date | string, day: Date): boolean {
    return toIsoDate(day) > toIsoDate(expiresOn);
}
