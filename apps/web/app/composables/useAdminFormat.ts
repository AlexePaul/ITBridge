/**
 * The formatting vocabulary of the admin area — E18/S5a.
 *
 * Pure functions, so vitest can hold them without mounting anything. Both exist to end a
 * copy-paste: every list screen had its own month names array and its own way of printing money,
 * and two of them disagreed about what a date looks like.
 */

const MONTHS_SHORT = [
  "ian.",
  "feb.",
  "mar.",
  "apr.",
  "mai",
  "iun.",
  "iul.",
  "aug.",
  "sept.",
  "oct.",
  "nov.",
  "dec.",
];

/**
 * `"2026-03-12"` → `"12 mar. 2026"`.
 *
 * From string components, never through `new Date()`: an ISO date string parses as **UTC**
 * midnight, so east of Greenwich — which is where the school is — the previous day comes back.
 * The rule and the tooling are in CLAUDE.md; this is the display end of the same discipline.
 * Feed it anything else and it comes back unchanged, which is what a table cell should do with
 * a value it does not understand.
 */
export function formatDateKey(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey);
  if (!match) return dateKey;
  const [, year, month, day] = match;
  const monthName = MONTHS_SHORT[Number(month) - 1];
  if (!monthName) return dateKey;
  return `${Number(day)} ${monthName} ${year}`;
}

/**
 * `350` → `"350 lei"`, `87.5` → `"87,50 lei"`.
 *
 * Comma as the decimal mark, because the reader is Romanian; two decimals or none, because money
 * has no third case. Non-numbers come back as an em dash — the cell's "nothing here" mark.
 */
export function formatLei(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const whole = Number.isInteger(value);
  const text = whole ? String(value) : value.toFixed(2).replace(".", ",");
  return `${text} lei`;
}

const MONTHS_LONG = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

/**
 * `"2026-03"` → `"martie 2026"` — the billing month, as a person says it.
 *
 * Lives here for the same reason the other two do: three screens about money had grown three
 * copies of the same array, and the third one was added by this file's author. Anything that is
 * not a `YYYY-MM` prefix comes back unchanged.
 */
export function formatMonth(monthIssued: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(monthIssued);
  if (!match) return monthIssued;
  const [, year, month] = match;
  const name = MONTHS_LONG[Number(month) - 1];
  return name ? `${name} ${year}` : monthIssued;
}

/**
 * `0.4` → `"40%"`, `0.655` → `"66%"`. A share, printed whole: nobody fills a room to a decimal.
 *
 * Non-numbers come back as the em dash, like `formatLei`.
 */
export function formatPercent(share: unknown): string {
  if (typeof share !== "number" || !Number.isFinite(share)) return "—";
  return `${Math.round(share * 100)}%`;
}
