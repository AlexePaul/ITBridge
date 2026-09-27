import { shiftMonth } from "~/composables/usePaymentMonth";

/** The school's clock — `SCHOOL_TIME_ZONE` in `apps/api/src/common/school-clock.ts`. */
const SCHOOL_TIME_ZONE = "Europe/Bucharest";

/**
 * The month a discount granted now belongs to: the month after the school's today — the server's
 * rule, `nextBillingMonthAt` in `apps/api/src/modules/discount/discount.rules.ts`, which the
 * referral button lands on too.
 *
 * The day is read on the school's clock and the month from the string's components, never through a
 * UTC date: at 01:00 on the first of a month in Bucharest it is still the previous month in UTC,
 * and the default would be the month that has just begun. The discount form defaulted to the current
 * month, and the server refused it wherever that month was already invoiced
 * (`DISCOUNT_MONTH_INVOICED`) — every family on stage, whose seed bills the month in progress (QA of
 * 27 September 2026). A month is invoiced only once it has been taught, so the next one never is.
 */
export function nextBillingMonthAt(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return shiftMonth(`${part("year")}-${part("month")}`, 1);
}
