import { addDays, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * When a family is late, and how late — E16/S7.
 *
 * **Fourteen days from the day the invoice was issued.** `Invoice` has no `dueDate` column and does
 * not get one here: the school issues every invoice for a month after counting the sessions that
 * month held, so the issue date is the day a family learns what they owe, and a term measured from
 * it is the same promise to everybody. A stored per-invoice date would be a field nobody varies,
 * free to drift from the practice it was meant to record.
 *
 * If the school ever wants a different term — or a fixed day of the month — this is the line to
 * change, and the day it becomes per-invoice is the day the column earns its place.
 */
export const PAYMENT_TERM_DAYS = 14;

/** The last day a family can pay without being late. Inclusive. */
export function dueDateFor(dateIssued: Date | string): Date {
    return addDays(typeof dateIssued === 'string' ? parseIsoDate(dateIssued.slice(0, 10)) : dateIssued, PAYMENT_TERM_DAYS);
}

/** Days past the term, or 0 while still inside it. Counted in whole calendar days. */
export function daysOverdue(dateIssued: Date | string, today: Date): number {
    const due = dueDateFor(dateIssued);
    const dueKey = toIsoDate(due);
    const todayKey = toIsoDate(today);
    if (todayKey <= dueKey) return 0;

    // Through UTC on purpose, and only here: both ends are already normalised to a calendar day, so
    // the subtraction counts days rather than hours, and the DST hour cannot round it wrong.
    const asUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);
    return Math.round((asUtc(todayKey) - asUtc(dueKey)) / 86_400_000);
}

/**
 * How old a debt is, in the words an admin would use.
 *
 * Buckets rather than a raw number, because the action differs by band and a list of days does not
 * say which: a week late is a reminder, two months late is a conversation. The thresholds are
 * deliberately coarse — nobody treats 34 days differently from 36.
 */
export type ArrearsBucket = 'due_soon' | 'overdue' | 'over_30' | 'over_60';

export function bucketFor(days: number, dueInDays: number): ArrearsBucket {
    if (days > 60) return 'over_60';
    if (days > 30) return 'over_30';
    if (days > 0) return 'overdue';
    void dueInDays;
    return 'due_soon';
}

/** Days until the term runs out; negative once it has. */
export function daysUntilDue(dateIssued: Date | string, today: Date): number {
    const due = toIsoDate(dueDateFor(dateIssued));
    const now = toIsoDate(today);
    const asUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);
    return Math.round((asUtc(due) - asUtc(now)) / 86_400_000);
}
