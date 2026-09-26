import { toDateKey } from "~/composables/useAttendanceCalendar";

/**
 * Which day the phone register shows — E12/S6, and the review of 26 September 2026.
 *
 * The screen showed today and nothing else, and it was the only one that could finish a register:
 * the desktop one offers only classes with no mark at all (its bulk save refuses a class that has
 * one), and a child's history is read-only. So a register half-taken on the phone, or one forgotten
 * until the next morning, could be neither completed nor corrected anywhere, while the attendance
 * index promised both. The screen now opens any day up to today, from `?zi=YYYY-MM-DD`, and saves
 * through the same per-child upsert, which is what a partial register needs.
 *
 * Day keys only, never a `Date` round trip through UTC: the same trap `toDateKey` exists to avoid.
 */

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The key itself when it names a real calendar day — not `2026-02-30`, not `26-9-2026`. */
export function parseDayKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DAY_KEY.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real ? value : null;
}

/**
 * The day to open: what `?zi=` names, when that is today or a day before it; today otherwise.
 *
 * No future day, on purpose. A register is the record of a class that took place, and a mark
 * typed before it — a child "present" at Thursday's class on Monday — is a statement nobody can
 * make yet.
 */
export function registerDay(query: unknown, today: string): string {
  const day = parseDayKey(Array.isArray(query) ? query[0] : query);
  return day !== null && day <= today ? day : today;
}

/** The day `delta` days away, counted on calendar components. */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const shifted = new Date(year, month - 1, date + delta);
  return toDateKey({
    year: shifted.getFullYear(),
    month: shifted.getMonth() + 1,
    day: shifted.getDate(),
  });
}

/** `26.09.2026`, the way the screen has always printed its day. */
export function dayLabel(day: string): string {
  const [year, month, date] = day.split("-");
  return `${Number(date)}.${month}.${year}`;
}
