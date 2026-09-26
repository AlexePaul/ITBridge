import { describe, expect, it } from "vitest";
import { monthRange, paymentsOnScreen, shiftMonth } from "~/composables/usePaymentMonth";

/**
 * The payments screen by month — review of 26 September 2026: every payment ever recorded was
 * 1.9 GB of browser memory at three years.
 */
describe("the payments screen's month", () => {
  it("covers the whole month, February and leap years included", () => {
    expect(monthRange("2026-09")).toEqual({ dateFrom: "2026-09-01", dateTo: "2026-09-30" });
    expect(monthRange("2026-02")).toEqual({ dateFrom: "2026-02-01", dateTo: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ dateFrom: "2028-02-01", dateTo: "2028-02-29" });
    expect(monthRange("2026-12")).toEqual({ dateFrom: "2026-12-01", dateTo: "2026-12-31" });
  });

  it("steps across a year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });

  it("keeps what waits on somebody from another month, once, and says how many", () => {
    const inMonth = [
      { id: 3, date: "2026-09-10" },
      { id: 4, date: "2026-09-02" },
    ];
    // An announced transfer from August, still unconfirmed, and one from this month that is both.
    const waiting = [
      { id: 1, date: "2026-08-28" },
      { id: 4, date: "2026-09-02" },
    ];

    const { rows, fromOtherMonths } = paymentsOnScreen("2026-09", inMonth, waiting);

    expect(rows.map((row) => row.id)).toEqual([3, 4, 1]);
    expect(fromOtherMonths).toBe(1);
  });
});
