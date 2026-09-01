/**
 * Money and dates as a parent reads them, not as a column prints them.
 *
 * Kept out of the job so the wording can be asserted without a queue behind it — the same split as
 * every other composer in the codebase.
 */

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

/** `'2026-03'` → `'martie'`. The year is left out: a reminder is about the recent past. */
export function romanianMonth(monthIssued: string): string {
    const [, month] = monthIssued.split('-');
    return MONTHS[Number(month) - 1] ?? monthIssued;
}

/** `'2026-03-15'` → `'15 martie'`. */
export function romanianDay(isoDate: string): string {
    const [, month, day] = isoDate.split('-');
    return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''}`.trim();
}

/** `350` → `'350 lei'`, `87.5` → `'87,50 lei'` — comma, because the reader is Romanian. */
export function formatLeiRo(value: number): string {
    const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace('.', ',');
    return `${text} lei`;
}
