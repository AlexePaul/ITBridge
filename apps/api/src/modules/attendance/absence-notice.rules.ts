import { ClassSession } from 'src/entities/class-session.entity';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * When a notice still counts — E12/S3.
 *
 * **The rule: before the class starts.** The story leaves the cutoff to the school („sau după regula
 * pe care o stabiliți"), and this is the one that matches the reason the story gives for wanting
 * notices at all — *profesorul vede dinainte cine lipsește*. A notice that arrives before the
 * teacher walks in has done its whole job; one that arrives afterwards has not, whatever hour it
 * came at.
 *
 * A stricter window — two hours before, or 10:00 on the day — was considered and is a one-line
 * change here if the school wants it. It is not the default because the case it would punish is a
 * child who gets a temperature at three for a four o'clock class, and no school means to make that
 * family worse off than one that simply says nothing.
 *
 * Times are compared in the school's own terms: the session carries a local date and a local
 * `HH:mm:ss`, and `now` is read through the same timezone. Comparing a `date` column against a UTC
 * instant is the trap `class-session.dates.ts` exists to avoid, one time zone away from being an
 * off-by-one-day bug.
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

/** The same stamp for a session's own start, built from its stored local components. */
export function sessionStartStamp(session: Pick<ClassSession, 'date' | 'startTime'>): string {
    return `${toIsoDate(session.date)}T${session.startTime.slice(0, 5)}`;
}

/** True when the notice arrived before the class began. Text comparison, both in school time. */
export function isInTime(session: Pick<ClassSession, 'date' | 'startTime'>, now: Date): boolean {
    return schoolLocalStamp(now) < sessionStartStamp(session);
}
