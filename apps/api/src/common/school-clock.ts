/**
 * The school's own wall clock, in one place.
 *
 * Every rule about *when* something happened is judged here rather than in UTC, and CLAUDE.md gives
 * the reason twice: a `date` column compared against an instant is an off-by-one-day bug that only
 * appears in some time zones, and a notice sent at 01:00 Bucharest time would be judged as having
 * arrived the day before. Both are invisible at review.
 *
 * This started life inside `absence-notice.rules.ts`, which is where the rule that needed it lives.
 * It moved out when a third caller appeared that has nothing to do with absences — E17/S7's
 * duplicate-broadcast guard, which asks what day it is at the school — because the alternative was
 * either an import that says nothing true about either module, or a second copy of the time zone.
 */

export const SCHOOL_TIME_ZONE = 'Europe/Bucharest';

/** `2026-03-09T15:30` — the school's wall clock, as sortable text. */
export function schoolLocalStamp(now: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: SCHOOL_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(now);

    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** `2026-03-09` — which day it is at the school, whatever the server thinks. */
export function schoolDay(now: Date): string {
    return schoolLocalStamp(now).slice(0, 10);
}
