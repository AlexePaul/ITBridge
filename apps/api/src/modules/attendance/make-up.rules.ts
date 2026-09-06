import { endOfIsoWeek, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * How long a make-up lives — E12/S4.
 *
 * **The week the class was missed in, and not an hour longer.** A missed Wednesday is made up on
 * the Thursday or the Saturday of that same week, or it is not made up at all.
 *
 * This replaces a thirty-day credit, and the difference is not a shorter number — it is a different
 * thing. Thirty days made the make-up a token the family carried and spent when it suited them,
 * which is why the old model let a parent browse compatible hours and book one. The school does not
 * work that way: it reads the week's absences on Monday and moves children between groups for that
 * week, so what a family is owed is a place in another group *now*, not a right kept in a drawer.
 *
 * Two consequences worth stating, because both are load-bearing:
 *
 * - **There is no expiry to warn anybody about.** A window that opens and closes inside one week
 *   cannot be usefully announced a week ahead; the notice that matters is the one saying where the
 *   child has been moved, which the office sends when it moves them.
 * - **The deadline in S3 is what makes this reachable.** Monday noon exists precisely so that the
 *   whole week is still ahead when the office starts placing children. Read the two rules together
 *   or neither makes sense.
 *
 * The date is still frozen onto the row when the credit is written, exactly as before — see
 * `MakeUpCredit.expiresOn`. That was never about the length of the window; it is about a family
 * being told a date that does not move under them afterwards.
 */
export function makeUpExpiryFor(missedOn: Date | string): Date {
    return endOfIsoWeek(typeof missedOn === 'string' ? parseIsoDate(missedOn.slice(0, 10)) : missedOn);
}

/** True when `day` is past the credit's last usable day. Both compared as local calendar dates. */
export function hasExpired(expiresOn: Date | string, day: Date): boolean {
    return toIsoDate(day) > toIsoDate(expiresOn);
}
