import { Weekday } from 'src/enum/weekday.enum';
import { isoWeekday, parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';

/** Romanian month names, for a sentence a parent reads rather than a column. */
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

/**
 * Lower case, because these appear mid-sentence: „o ședință de vineri 28.08.2026".
 *
 * `WEEKDAY_LABELS` in `@itbridge/types` has the same seven words, capitalised for a table header,
 * and is not reused here on purpose: `apps/api` imports that package for **types only** today, and
 * pulling a value out of it would make the compiled backend require the workspace package at
 * runtime. Guaranteeing that in production is the deploy story's job, and the deploy story is not
 * written (E01/S4). Seven words are not worth being the first thing to depend on it.
 */
const WEEKDAY_NAMES: Record<Weekday, string> = {
    [Weekday.MONDAY]: 'luni',
    [Weekday.TUESDAY]: 'marți',
    [Weekday.WEDNESDAY]: 'miercuri',
    [Weekday.THURSDAY]: 'joi',
    [Weekday.FRIDAY]: 'vineri',
    [Weekday.SATURDAY]: 'sâmbătă',
    [Weekday.SUNDAY]: 'duminică',
};

/** The weekday's name, mid-sentence. */
export function romanianWeekdayName(weekday: Weekday): string {
    return WEEKDAY_NAMES[weekday];
}

/**
 * `2026-09-09` → `miercuri, 9 septembrie` — a day a parent can find on their own calendar.
 *
 * The weekday is the half that gets acted on: told „9 septembrie" a family looks it up, told
 * „miercuri" they already know whether they can be there. Both, because only the date is
 * unambiguous.
 */
export function romanianDayAndDate(date: Date | string): string {
    const day = parseIsoDate(toIsoDate(date));
    return `${romanianWeekdayName(isoWeekday(day))}, ${romanianDate(day)}`;
}

/**
 * `2026-03-12` → `12 martie`, for the body of an email.
 *
 * Lives in `mail` rather than beside the first job that needed it: three different things now write
 * a date into a message to a parent — a make-up window, a cancelled class, a moved one — and the
 * second of them had no business importing from the module that owns registers just to write a
 * sentence. Same reason `officeAddress` moved here.
 *
 * Goes through `toIsoDate`, so a `Date` is read by its local components and never through UTC: the
 * school is east of Greenwich, where the shortcut is wrong by exactly one day.
 */
export function romanianDate(date: Date | string): string {
    const iso = toIsoDate(date);
    const [, month, day] = iso.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''}`;
}
