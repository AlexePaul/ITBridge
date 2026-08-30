import { BadRequestException } from '@nestjs/common';
import { Weekday } from 'src/enum/weekday.enum';

/**
 * Calendar arithmetic for the timetable. Every `Date` built here is **local** midnight, deliberately.
 *
 * TypeORM writes a `date` column by reading the value's local components, so `new Date('2026-08-29')`
 * — which JavaScript parses as *UTC* midnight — is stored as the 28th in every timezone west of
 * Greenwich. The school is in Romania and CI is not, so that difference is exactly the kind of bug
 * that shows up only in one place. Building dates with the `(year, month, day)` constructor makes
 * what goes in the same as what comes out, everywhere.
 *
 * It also sidesteps DST: `addDays` rebuilds the components rather than adding milliseconds, so a
 * week that crosses the clock change is still seven days and still lands at midnight.
 */

/** `YYYY-MM-DD`, loosely — `parseIsoDate` is what rejects the 30th of February. */
export const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const ISO_DATE_MESSAGE = 'must be a calendar date in YYYY-MM-DD form';

/** Local midnight for an ISO date, rejecting anything that is not a real day. */
export function parseIsoDate(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    // `new Date(2026, 1, 30)` silently becomes the 2nd of March, and `0050` becomes 1950. The
    // round-trip is what catches both, so a bad date is a 400 rather than a session on a day the
    // caller never asked for.
    if (toIsoDate(date) !== value) {
        throw new BadRequestException(`${value} is not a real calendar date`);
    }
    return date;
}

/** The inverse. Accepts what the driver hands back for a `date` column, which is a string. */
export function toIsoDate(value: Date | string): string {
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Today, with the time thrown away. */
export function startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** ISO weekday, 1 = Monday through 7 = Sunday. `getDay()` calls Sunday 0. */
export function isoWeekday(date: Date): Weekday {
    const day = date.getDay();
    return day === 0 ? Weekday.SUNDAY : day;
}

/**
 * Every occurrence of `weekday` in `[from, until)` — `from` included when it is that weekday.
 *
 * The window is half-open so that a horizon of N weeks is exactly `N * 7` days and contains exactly
 * N occurrences of every weekday, with no off-by-one at either end.
 */
export function occurrencesOf(weekday: Weekday, from: Date, until: Date): Date[] {
    const dates: Date[] = [];
    let cursor = addDays(from, (weekday - isoWeekday(from) + 7) % 7);
    while (cursor.getTime() < until.getTime()) {
        dates.push(cursor);
        cursor = addDays(cursor, 7);
    }
    return dates;
}
