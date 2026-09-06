import { ClassSession } from 'src/entities/class-session.entity';
import { endOfIsoWeek, parseIsoDate, startOfIsoWeek, toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * Where a missed hour can be given back — E12/S4.
 *
 * **There is no make-up credit.** There was one: a row a family earned by missing a class, carried
 * for thirty days and spent on an hour they picked themselves from a portal screen. It is gone, and
 * not because thirty days was too long. It described a school that does not exist. What actually
 * happens is that the office reads the week's announced absences on Monday and **moves the child
 * into another group for that week** — by hand, because deciding which group has a chair and a
 * teacher who can take one more nine-year-old is not a query. The family is told where their child
 * goes; they choose nothing, so there is nothing for them to hold.
 *
 * What is left of the old model is a single nullable column, `AbsenceNotice.replacementSession`,
 * and these two functions, which say what may be written into it. The rest — status, expiry,
 * booking, release, consumption, the evening mail announcing a right — went with the credit.
 *
 * The window is **the week the class was missed in**. A missed Wednesday is made up on the Thursday
 * or the Saturday of that same week, or it is not made up at all, and that is not a shortened
 * thirty days: it follows from the move being a move. A child cannot sit with another group in a
 * week that has already gone, and the school will not run one group short and another over for
 * longer than the week that caused it.
 *
 * Read together with the deadline in S3, which is what makes this reachable at all: Monday noon
 * exists exactly so the whole week is still ahead when the office starts placing children.
 */

/** The Monday and Sunday that bound the week a missed class falls in, inclusive, as ISO dates. */
export function replacementWeekFor(missedOn: Date | string): { from: string; to: string } {
    const missed = typeof missedOn === 'string' ? parseIsoDate(missedOn.slice(0, 10)) : missedOn;
    return { from: toIsoDate(startOfIsoWeek(missed)), to: toIsoDate(endOfIsoWeek(missed)) };
}

/**
 * True when `replacement` falls in the same week as the class that was missed.
 *
 * Compared as `YYYY-MM-DD` strings, both built from local components: the sessions carry `date`
 * columns, and comparing those through UTC instants is the off-by-one-day trap
 * `class-session.dates.ts` exists to avoid.
 */
export function isInReplacementWeek(missed: Pick<ClassSession, 'date'>, replacement: Pick<ClassSession, 'date'>): boolean {
    const week = replacementWeekFor(missed.date);
    const date = toIsoDate(replacement.date);
    return date >= week.from && date <= week.to;
}
