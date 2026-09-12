/**
 * How big a "three-year school" actually is, in rows — the arithmetic behind `pnpm seed:scale`.
 *
 * Pure, and separate from the script, for the reason every `*.rules.ts` in this repo is: the shape
 * is the part that can be quietly wrong. Multiply a child by *every* class instead of by the
 * classes of **its own group** and the register goes from 47 thousand rows to 936 thousand — the
 * script still runs, still prints a cheerful summary, and every measurement taken against it is
 * about a school that does not exist.
 *
 * Why this exists at all: the development seed is ~120 classes and ~80 register marks, and at that
 * size Postgres picks a sequential scan whatever indexes you give it. So a query that scans a whole
 * table looks *identical* to one that uses an index, and the first real evidence arrives from a
 * school with three years of history behind it. Two such queries were found that way in September
 * 2026 — one of them summing an invoice's payments while holding that invoice's row lock.
 */

/** What the operator asks for. Everything else is derived. */
export interface ScaleRequest {
    /** Years of history behind today. Three is a school that has been running a while. */
    years: number;
    /** Families on the books, including those who have left. */
    families: number;
}

/** What that turns into, table by table. Printed after the load so the numbers can be checked. */
export interface ScaleShape {
    families: number;
    children: number;
    groups: number;
    rooms: number;
    weeks: number;
    classes: number;
    /** One mark per child per class **of that child's group** — the number most easily got wrong. */
    attendances: number;
    months: number;
    invoices: number;
    outbox: number;
}

/** Children per family. Not every family has two, and the seed's own mix is roughly this. */
export const CHILDREN_PER_FAMILY = 1.2;

/** A group is one room, once a week. Ten is `Room.capacity`'s default and the school's own number. */
export const CHILDREN_PER_GROUP = 10;

/** Weeks a school actually teaches in a year — 52 less the holidays the calendar already models. */
export const TEACHING_WEEKS_PER_YEAR = 39;

/**
 * Roughly how many invoices end up paid — **documentation, not a prediction**.
 *
 * The generator marks one invoice in thirteen unpaid, so that the arrears screen and the reminders
 * have something to read. The exact count is whatever that expression produces; nothing here
 * forecasts it, because a forecast that disagrees with the table is how a summary starts lying.
 */
export const UNPAID_IN_EVERY = 13;

/**
 * Messages per family per month.
 *
 * Deliberately generous: the outbox is the one table nothing ever deletes from — `sent` rows stay
 * forever, which is exactly what makes it the table where an unrestricted query hurts first.
 */
export const MESSAGES_PER_FAMILY_PER_MONTH = 6;

export function scaleShape(request: ScaleRequest): ScaleShape {
    const families = Math.max(1, Math.floor(request.families));
    const years = Math.max(1, Math.floor(request.years));

    const children = Math.round(families * CHILDREN_PER_FAMILY);
    const groups = Math.max(1, Math.ceil(children / CHILDREN_PER_GROUP));
    const weeks = years * TEACHING_WEEKS_PER_YEAR;
    const months = years * 12;

    return {
        families,
        children,
        groups,
        // One room per group: a room holds one group at a time, and the timetable's uniqueness is
        // per room, so sharing rooms here would only invent collisions the real school does not have.
        rooms: groups,
        weeks,
        classes: groups * weeks,
        // **Per group, not per school.** Each child sits in one group and is marked once per class
        // of that group — so this is children × weeks, never children × classes.
        attendances: children * weeks,
        months,
        invoices: families * months,
        outbox: families * months * MESSAGES_PER_FAMILY_PER_MONTH,
    };
}

/**
 * The tables worth printing after a load, widest first.
 *
 * Takes the counts **read back from the database**, not the ones predicted above. The two are not
 * always the same and the difference is not a rounding error: `payments` is one row per *paid*
 * invoice, and which invoices are paid is decided by an expression in SQL rather than by anything
 * here. The first version of this printed a prediction and was quietly wrong by thirty rows — a summary that disagrees with the database is worse than no summary, because the whole
 * purpose of this tool is to tell somebody what they are measuring against.
 */
export function describeShape(counts: Record<string, number>): string[] {
    return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([table, count]) => `${table.padEnd(16)} ${count.toLocaleString('en-US')}`);
}
