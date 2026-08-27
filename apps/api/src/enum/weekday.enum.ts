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

// The Romanian names deliberately live in `packages/types`, not here: they are user-facing wording
// and the frontend is what renders them. Keeping a second copy alongside this enum is how three
// different weekday lists came to exist, two of them missing Sunday.
