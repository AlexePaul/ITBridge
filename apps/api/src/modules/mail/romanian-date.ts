import { toIsoDate } from 'src/modules/class-session/class-session.dates';

/** Romanian month names, for a sentence a parent reads rather than a column. */
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

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
