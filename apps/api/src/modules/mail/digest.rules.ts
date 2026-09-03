import { MessageFrequency } from 'src/enum/message-frequency.enum';
import { schoolDay, schoolLocalStamp } from 'src/common/school-clock';

/**
 * When a held message is allowed out — E17/S6.
 *
 * Everything here is **text arithmetic on the school's wall clock**, never instants. That is the
 * house rule (CLAUDE.md), and the reason for it applies with force: the whole mechanism is about
 * "this evening" and "next Monday", and a server in another zone answering those questions from UTC
 * would release a day early or a day late — an error of exactly one day, visible in some zones only,
 * and invisible at review.
 */

/**
 * 18:00 school time — after the last class, before the evening.
 *
 * The same reasoning as E12's make-up notices at 19:00: nothing that gets held here is urgent, so
 * the hour is chosen for when a parent will read it rather than for when the thing happened.
 * Earlier than 19:00 because a digest may carry an invoice, and money is better read before supper
 * than after it.
 */
export const DIGEST_HOUR = 18;

/** Monday, in `Date.getDay()` terms. The weekly digest opens the week rather than closing it. */
const MONDAY = 1;

/** `2026-03-09T18:00` — the cutoff on a given school day, as a comparable stamp. */
function cutoffOn(day: string): string {
    return `${day}T${String(DIGEST_HOUR).padStart(2, '0')}:00`;
}

/**
 * The day after `day`, built from local components.
 *
 * `new Date('2026-03-09')` is midnight **UTC** and lands on the previous day west of Greenwich;
 * splitting the string and handing the parts to the constructor keeps it a calendar operation, which
 * is what it is. Same trap `class-session.dates.ts` exists to avoid.
 */
function addDays(day: string, count: number): string {
    const [year, month, date] = day.split('-').map(Number);
    const shifted = new Date(year, month - 1, date + count);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

function weekdayOf(day: string): number {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date).getDay();
}

/**
 * The stamp at which a message queued at `createdAt` may leave, for a family on `frequency`.
 *
 * Computed per message from when it was written rather than from a per-recipient "last digest sent"
 * marker, and that is what makes the daily cap actually hold. Anchored to a shared 18:00 instead,
 * a message queued at 19:00 would find the cutoff already past and go out immediately — a second
 * email on a day that had already had its one.
 */
export function releaseStampFor(createdAt: Date, frequency: MessageFrequency): string {
    const created = schoolLocalStamp(createdAt);
    if (frequency === MessageFrequency.IMMEDIATE) return created;

    const createdDay = created.slice(0, 10);
    const beforeCutoffToday = created < cutoffOn(createdDay);

    if (frequency === MessageFrequency.DAILY) {
        return beforeCutoffToday ? cutoffOn(createdDay) : cutoffOn(addDays(createdDay, 1));
    }

    // Weekly: the next Monday cutoff strictly after the message was written. A message queued on
    // Monday morning goes out that evening; one queued on Monday night waits a week.
    const daysToMonday = (MONDAY - weekdayOf(createdDay) + 7) % 7;
    if (daysToMonday === 0) {
        return beforeCutoffToday ? cutoffOn(createdDay) : cutoffOn(addDays(createdDay, 7));
    }
    return cutoffOn(addDays(createdDay, daysToMonday));
}

/**
 * Whether this held message has waited long enough, or has waited as long as it may.
 *
 * The second half is the safety valve, and without it the weekly cadence would be a bug rather than
 * a preference: E12's make-up warning goes out seven days before the right lapses, so a digest that
 * held it for a week would deliver a warning about something already gone. A sender that knows its
 * message has a last useful day says so, and that day wins over the cadence.
 */
export function isDue(message: { createdAt: Date; digestNotAfter: string | null }, frequency: MessageFrequency, now: Date): boolean {
    if (message.digestNotAfter !== null && schoolDay(now) >= message.digestNotAfter) return true;
    return schoolLocalStamp(now) >= releaseStampFor(message.createdAt, frequency);
}
