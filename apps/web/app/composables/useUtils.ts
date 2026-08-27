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
