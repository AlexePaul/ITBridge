/**
 * The two ends of a date field — E18/S5b.
 *
 * A form's state carries a date the way the wire does: the `YYYY-MM-DD` string that
 * `formatDateKey` prints and the API accepts. The calendar widgets want a `CalendarDate`. These
 * two functions are the only crossing between the two, so no form has to remember that a
 * `CalendarDate` is not a `Date` — the two child forms used to turn the picked value into a
 * string through `toISOString()`, the UTC trap from CLAUDE.md: a day early east of Greenwich.
 *
 * Pure, so vitest can hold them without mounting anything.
 */
import { parseDate, type CalendarDate, type DateValue } from "@internationalized/date";
import { toDateKey } from "~/composables/useAttendanceCalendar";

/** What a form state holds and the API takes: a day key, `YYYY-MM-DD`, nothing looser. */
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `"2018-03-16"` → the calendar's value for 16 March 2018; anything else → `undefined`.
 *
 * A timestamp's date part is taken and the rest ignored, as `formatDateKey` does. The parsing
 * goes through `parseDate`, which refuses an impossible day — `new CalendarDate(2026, 2, 30)`
 * would quietly become the 28th, and a birth date that moved two days without anyone typing
 * them is the wrong kind of forgiving.
 */
export function dateKeyToCalendar(key: string | null | undefined): CalendarDate | undefined {
  if (!key) return undefined;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(key);
  const [, dayKey] = match ?? [];
  if (!dayKey) return undefined;
  try {
    return parseDate(dayKey);
  } catch {
    return undefined;
  }
}

/**
 * A calendar value → `"2018-03-16"`; nothing → `undefined`.
 *
 * From the value's own components, through the same `toDateKey` the attendance calendar uses —
 * never through `Date`. A date-time value contributes its date part, in its own calendar day.
 */
export function calendarToDateKey(value: DateValue | null | undefined): string | undefined {
  if (!value) return undefined;
  return toDateKey(value);
}
