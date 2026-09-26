/**
 * The payments screen, one month at a time — and what a month must not hide.
 *
 * `/admin/payments` asked for every payment ever recorded and drew every one: at three years of a
 * school (`pnpm seed:scale`) that was 9.6 MB from the API, 8,300 rows and 1.9 GB of browser memory,
 * 46 seconds before the screen answered (review of 26 September 2026). A school laptop does not
 * survive that, and the screen was already unusable long before: nobody reads the 8,000th row.
 *
 * So it shows the month of the payments' own dates, the current one first — plus, whatever their
 * month, the rows somebody still has to act on: a transfer announced and not yet confirmed, and a
 * collection SmartBill needs checked or sent again. Those are the reason to open the screen at all,
 * and a month filter would bury last month's in the month nobody is looking at.
 *
 * Month keys are `YYYY-MM` strings and never pass through `Date` in UTC: the same one-day trap as
 * everywhere else in the app (CLAUDE.md, „Datele calendaristice…").
 */

/** The first and last day of a `YYYY-MM` month, as the API's `dateFrom` / `dateTo`. */
export function monthRange(month: string): { dateFrom: string; dateTo: string } {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  // Day 0 of the next month is the last day of this one, read from local components.
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { dateFrom: `${month}-01`, dateTo: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** `"2026-01"` shifted by `-1` is `"2025-12"`. */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * The month's payments and the ones waiting on somebody, once each, newest first — and how many of
 * the waiting ones are from another month, so the screen can say why they are there.
 */
export function paymentsOnScreen<P extends { id: number; date: string }>(
  month: string,
  inMonth: readonly P[],
  waiting: readonly P[]
): { rows: P[]; fromOtherMonths: number } {
  const byId = new Map<number, P>();
  for (const payment of [...inMonth, ...waiting]) byId.set(payment.id, payment);
  const rows = [...byId.values()].sort((a, b) =>
    String(b.date).slice(0, 10).localeCompare(String(a.date).slice(0, 10))
  );
  const fromOtherMonths = waiting.filter(
    (payment) => !String(payment.date).startsWith(month)
  ).length;
  return { rows, fromOtherMonths };
}
