import { describe, expect, it } from "vitest";
import { nextBillingMonthAt } from "~/composables/useBillingMonth";

/**
 * The month a discount typed on /admin/reduceri lands on by default — the server's own rule,
 * `nextBillingMonthAt` in `apps/api/src/modules/discount/discount.rules.ts`: the month after the
 * school's today. The form defaulted to the current month, which the server refuses wherever it is
 * already invoiced (`DISCOUNT_MONTH_INVOICED`) — on stage, every family (QA of 27 September 2026).
 */
describe("nextBillingMonthAt", () => {
  it("is the month after the school's today", () => {
    expect(nextBillingMonthAt(new Date("2026-09-27T09:00:00Z"))).toBe("2026-10");
  });

  it("rolls December over into January", () => {
    expect(nextBillingMonthAt(new Date("2026-12-31T12:00:00Z"))).toBe("2027-01");
  });

  // 01:30 on 1 October in Bucharest is still 30 September in UTC: on the UTC day the default would
  // be October, the month that has just begun and that the server does not pick.
  it("reads the day on the school's clock, not in UTC", () => {
    expect(nextBillingMonthAt(new Date("2026-09-30T22:30:00Z"))).toBe("2026-11");
    expect(nextBillingMonthAt(new Date("2026-12-31T22:30:00Z"))).toBe("2027-02");
  });
});
