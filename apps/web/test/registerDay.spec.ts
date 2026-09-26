import { describe, expect, it } from "vitest";
import { dayLabel, parseDayKey, registerDay, shiftDay } from "~/composables/useRegisterDay";

/**
 * The phone register opens any day up to today (review of 26 September 2026). It showed today and
 * nothing else, while it was the only screen that could finish a register already begun — so a
 * class forgotten until the next morning could be neither completed nor corrected anywhere.
 */
describe("registerDay", () => {
  const today = "2026-09-26";

  it("opens today when nothing is asked for — the screen a teacher bookmarks", () => {
    expect(registerDay(undefined, today)).toBe(today);
  });

  it("opens an earlier day named in the address", () => {
    expect(registerDay("2026-09-25", today)).toBe("2026-09-25");
    expect(registerDay("2026-03-02", today)).toBe("2026-03-02");
  });

  it("never opens a day after today: a mark is about a class that took place", () => {
    expect(registerDay("2026-09-27", today)).toBe(today);
  });

  it("falls back to today on anything that is not a real day", () => {
    expect(registerDay("2026-02-30", today)).toBe(today);
    expect(registerDay("26.09.2026", today)).toBe(today);
    expect(registerDay("", today)).toBe(today);
    expect(registerDay(42, today)).toBe(today);
  });

  it("reads the first value of a repeated query parameter", () => {
    expect(registerDay(["2026-09-24", "2026-09-20"], today)).toBe("2026-09-24");
  });
});

describe("shiftDay", () => {
  it("steps across month and year ends on calendar components", () => {
    expect(shiftDay("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("keeps the day across the October change of time", () => {
    expect(shiftDay("2026-10-25", 1)).toBe("2026-10-26");
    expect(shiftDay("2026-10-26", -1)).toBe("2026-10-25");
  });
});

describe("parseDayKey and dayLabel", () => {
  it("accepts a real key and prints it the way the screen always has", () => {
    expect(parseDayKey("2026-09-05")).toBe("2026-09-05");
    expect(dayLabel("2026-09-05")).toBe("5.09.2026");
  });
});
