import { describe, expect, it } from "vitest";
import {
  addMonthKeys,
  defaultReportRange,
  isValidRange,
  monthKeyOf,
} from "~/composables/useReportRange";

/**
 * The finance report's month range — E21/S2. Month keys are strings end to end; a `Date` never
 * appears, so there is no midnight-UTC edge to fall off on the first of a month.
 */
describe("addMonthKeys", () => {
  it("carries across the year boundary both ways", () => {
    expect(addMonthKeys("2026-01", -1)).toBe("2025-12");
    expect(addMonthKeys("2025-12", 1)).toBe("2026-01");
    expect(addMonthKeys("2026-03", -11)).toBe("2025-04");
    expect(addMonthKeys("2026-03", 24)).toBe("2028-03");
  });
});

describe("defaultReportRange", () => {
  it("is the last twelve months, the current one included", () => {
    expect(monthKeyOf("2026-09-02")).toBe("2026-09");
    expect(defaultReportRange("2026-09-02")).toEqual({ from: "2025-10", to: "2026-09" });
    expect(defaultReportRange("2026-01-01")).toEqual({ from: "2025-02", to: "2026-01" });
  });
});

describe("isValidRange", () => {
  it("accepts two month keys in order", () => {
    expect(isValidRange("2026-01", "2026-03")).toBe(true);
    expect(isValidRange("2026-03", "2026-03")).toBe(true);
  });

  it("refuses a backwards range or anything that is not a month", () => {
    expect(isValidRange("2026-04", "2026-03")).toBe(false);
    expect(isValidRange("2026-13", "2026-03")).toBe(false);
    expect(isValidRange("", "2026-03")).toBe(false);
  });
});
