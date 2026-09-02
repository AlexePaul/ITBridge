/**
 * The month range of the finance report — E21/S2.
 *
 * String arithmetic on `YYYY-MM`, never a `Date` round-trip: the same UTC-by-one-day trap that
 * bites date keys bites month keys on the first of the month, east of Greenwich.
 */

/** How many months the report shows by default. Mirrors `DEFAULT_FINANCE_MONTHS` in the API. */
export const DEFAULT_REPORT_MONTHS = 12;

export const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `"2026-03-14"` → `"2026-03"`. */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** `monthKey` moved by `steps` months; negative steps go back. Carries years both ways. */
export function addMonthKeys(monthKey: string, steps: number): string {
  const [year = 0, month = 1] = monthKey.split("-").map(Number);
  const index = year * 12 + (month - 1) + steps;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

/** The last twelve months ending on the month of `todayKey`, the current one included. */
export function defaultReportRange(todayKey: string): { from: string; to: string } {
  const to = monthKeyOf(todayKey);
  return { from: addMonthKeys(to, -(DEFAULT_REPORT_MONTHS - 1)), to };
}

/** Whether a from/to pair can be sent: both real month keys, in order. */
export function isValidRange(from: string, to: string): boolean {
  return MONTH_KEY_PATTERN.test(from) && MONTH_KEY_PATTERN.test(to) && from <= to;
}
