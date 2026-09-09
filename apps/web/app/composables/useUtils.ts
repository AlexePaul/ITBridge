import { WEEKDAY_LABELS, type Weekday } from "~/types/group.types";
export function normalizeName(name: string): string {
  if (typeof name !== "string" || name.length === 0) {
    return "";
  }

  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function formatTime(time: string): string {
  return time.slice(0, 5); // HH:mm from HH:mm:ss
}

/**
 * Reads from the shared contract rather than a local array. There used to be three copies of the
 * weekday names in this app, two of them missing Sunday and spelling Marți and Sâmbătă without
 * diacritics.
 */
export function getWeekdayName(weekday: Weekday | number): string {
  return WEEKDAY_LABELS[weekday as Weekday] ?? "Necunoscut";
}

/**
 * The weekday of a `YYYY-MM-DD` key, in words.
 *
 * Built from the three numbers rather than by parsing the string: `new Date("2026-09-10")` is *UTC*
 * midnight, which in a browser west of Greenwich is the 9th — the off-by-one-day trap the backend's
 * `class-session.dates.ts` exists for, and it is exactly as available here. The `Weekday` enum
 * counts Monday as 1 and Sunday as 7, where `getDay()` calls Sunday 0.
 */
export function weekdayNameOf(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!match) return "";
  const [, year, month, day] = match;
  const weekday = new Date(Number(year), Number(month) - 1, Number(day)).getDay();
  return getWeekdayName(weekday === 0 ? 7 : weekday);
}

/**
 * Romanian mobile numbers, as people actually type them, turned into the canonical `+40…` form.
 *
 * The API accepts both `0712345678` and `+40712345678` (`@IsPhoneNumber('RO')`), but what gets
 * stored should be one shape, otherwise the duplicate-phone check compares two spellings of the
 * same number and lets both through.
 */
export function normalizePhone(raw: string): string {
  const compact = raw.replace(/[\s.\-()]/g, "");
  if (compact.startsWith("+")) return compact;
  if (compact.startsWith("00")) return `+${compact.slice(2)}`;
  if (compact.startsWith("0")) return `+40${compact.slice(1)}`;
  return compact;
}

/** Accepts `07xxxxxxxx`, `+407xxxxxxxx` and `00407xxxxxxxx`, with or without separators. */
export function isRomanianPhone(raw: string): boolean {
  return /^\+407\d{8}$/.test(normalizePhone(raw));
}

/**
 * The calendar day an instant falls on, `YYYY-MM-DD`, read from local components.
 *
 * Never `toISOString().slice(0, 10)`. That is the **UTC** day, and Romania is ahead of UTC all
 * year, so between midnight and 03:00 every one of those reads as yesterday — a period that ended
 * last night still counted as running, a date picker offering a day already gone, a family
 * counted as having waited a day less than they have. The backend has the same rule twice, in
 * `class-session.dates.ts` and in `school-clock.ts`; this is the browser's copy, and the browser
 * it runs in is the office's.
 */
export function dayKey(at: Date = new Date()): string {
  const year = String(at.getFullYear()).padStart(4, "0");
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Whole calendar days between an instant and now — mornings, not blocks of 24 hours.
 *
 * The distinction is E17/S8's, and it is the one anybody reading „acum 2 zile" actually means:
 * something recorded yesterday at 18:00 and read today at 09:00 is **one** day old, not zero. An
 * elapsed-milliseconds division answers the other question, and answers it differently on two
 * screens asking the same one.
 *
 * Negative differences are floored at zero: a row dated in the future has not been waiting.
 */
export function daysSince(
  instant: string | Date | null | undefined,
  now: Date = new Date()
): number {
  if (!instant) return 0;
  const at = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(at.getTime())) return 0;
  return Math.max(0, Math.round((midnightOf(dayKey(now)) - midnightOf(dayKey(at))) / 86_400_000));
}

/** `YYYY-MM-DD` as a UTC instant, so two of them subtract to an exact number of days. */
function midnightOf(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
