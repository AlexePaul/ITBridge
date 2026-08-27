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
