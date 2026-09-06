import { addDays, parseIsoDate, startOfIsoWeek } from 'src/modules/class-session/class-session.dates';

/**
 * Which month a class belongs to, for billing — E15/S9.
 *
 * **A week belongs to the month its Monday falls in, whole.** A week that opens on Monday 30 August
 * is an August week, and the Friday of it — 3 September — is billed to August with the rest.
 *
 * The school teaches in weeks, and it invoices what it taught. Splitting a week down the middle
 * because a month boundary happens to run through it would put two of a group's sessions on one
 * invoice and three on the next, for a reason that has nothing to do with the child, the group or
 * the timetable. The week is the unit everywhere else in the platform — the absence deadline of
 * E12/S3 and the make-up window of E12/S4 are both written in it — and this is the same unit
 * reaching the money.
 *
 * **This is not `billingMonthOf` from the reports module, and the two must not be merged.** That one
 * answers a different question: which calendar month did a *payment* arrive in. Money is not taught
 * in a week — it moves on a day — so a transfer on 3 September is September cash, whatever week the
 * lesson it pays for sat in. One function with both meanings would be a silent, load-bearing
 * ambiguity in the one place the platform decides amounts.
 */
export function teachingMonthOf(sessionDate: Date | string): string {
    const date = typeof sessionDate === 'string' ? parseIsoDate(sessionDate.slice(0, 10)) : sessionDate;
    const monday = startOfIsoWeek(date);
    return `${monday.getFullYear()}-${`${monday.getMonth() + 1}`.padStart(2, '0')}`;
}

/**
 * The calendar days a billing month covers, both ends inclusive — the inverse of `teachingMonthOf`.
 *
 * Given `2026-08`, the first Monday of August through the Sunday that closes the week of its last
 * Monday. The counting query in S9 wants a range rather than a month string, and deriving one from
 * the other twice is how the two would come to disagree.
 *
 * Note what falls out of it: consecutive months never overlap and never leave a gap, because every
 * week is claimed by exactly one Monday. The first days of a month can belong to the month before —
 * 1 August is a July day when August opens mid-week — and that is the rule working, not an edge.
 */
export function teachingMonthRange(month: string): { from: string; to: string } {
    const [year, mon] = month.split('-').map(Number);

    // The week containing the 1st may have opened in the previous month, and then it is that
    // month's week, not this one's — so this month starts with the following Monday.
    let firstMonday = startOfIsoWeek(new Date(year, mon - 1, 1));
    if (firstMonday.getMonth() !== mon - 1) firstMonday = addDays(firstMonday, 7);

    // Day 0 of the next month is the last day of this one. Its Monday is always inside the month:
    // the last day is at most six days past it, and no month is shorter than a week.
    const lastMonday = startOfIsoWeek(new Date(year, mon, 0));

    return { from: toKey(firstMonday), to: toKey(addDays(lastMonday, 6)) };
}

/** `YYYY-MM-DD` from local components, never through a UTC round trip. */
function toKey(date: Date): string {
    return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
}
