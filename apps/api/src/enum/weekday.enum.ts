/**
 * ISO-8601 weekday. Monday is 1, Sunday is 7 — the same convention Postgres `isodow` and
 * `Date.prototype.getDay()` (shifted) use, and the one the group timetable is built on.
 *
 * A number is what the column stores, but a bare number is what makes `weekday: 6` unreadable at a
 * call site and lets `weekday: 0` or `weekday: 8` through without anyone noticing.
 */
export enum Weekday {
    MONDAY = 1,
    TUESDAY = 2,
    WEDNESDAY = 3,
    THURSDAY = 4,
    FRIDAY = 5,
    SATURDAY = 6,
    SUNDAY = 7,
}

/** The values only, for `@IsEnum` and for a CHECK constraint. */
export const WEEKDAYS = [Weekday.MONDAY, Weekday.TUESDAY, Weekday.WEDNESDAY, Weekday.THURSDAY, Weekday.FRIDAY, Weekday.SATURDAY, Weekday.SUNDAY] as const;

/** Romanian names, for anything a parent or a teacher reads. */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
    [Weekday.MONDAY]: 'luni',
    [Weekday.TUESDAY]: 'marți',
    [Weekday.WEDNESDAY]: 'miercuri',
    [Weekday.THURSDAY]: 'joi',
    [Weekday.FRIDAY]: 'vineri',
    [Weekday.SATURDAY]: 'sâmbătă',
    [Weekday.SUNDAY]: 'duminică',
};
