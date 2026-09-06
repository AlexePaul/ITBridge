import { describe, expect, it } from "vitest";
import {
  formatDateKey,
  formatLei,
  formatMonth,
  formatPercent,
  ageOn,
  formatAge,
} from "~/composables/useAdminFormat";

/**
 * The admin area's formatting vocabulary — E18/S5a.
 *
 * `formatDateKey` exists because of the UTC trap: `new Date('2026-08-29')` is midnight UTC, and
 * east of Greenwich — where the school is — reading it back locally gives the 28th. The formatter
 * therefore never touches `Date`; these tests hold that the output comes from the string alone.
 */
describe("formatDateKey", () => {
  it("prints a Romanian short date from the string components", () => {
    expect(formatDateKey("2026-03-12")).toBe("12 mar. 2026");
  });

  it("does not pad the day", () => {
    expect(formatDateKey("2026-12-01")).toBe("1 dec. 2026");
  });

  it("covers every month, including the unabbreviated May", () => {
    expect(formatDateKey("2026-05-15")).toBe("15 mai 2026");
    expect(formatDateKey("2026-09-01")).toBe("1 sept. 2026");
  });

  it("passes through a value it does not understand, instead of guessing", () => {
    expect(formatDateKey("azi")).toBe("azi");
    expect(formatDateKey("")).toBe("");
    expect(formatDateKey("2026-13-01")).toBe("2026-13-01");
  });

  it("takes a timestamp's date part and ignores the rest", () => {
    expect(formatDateKey("2026-03-12T10:00:00.000Z")).toBe("12 mar. 2026");
  });
});

describe("formatLei", () => {
  it("whole amounts carry no decimals", () => {
    expect(formatLei(350)).toBe("350 lei");
  });

  it("fractional amounts get two decimals and a comma — the reader is Romanian", () => {
    expect(formatLei(87.5)).toBe("87,50 lei");
  });

  it("answers an em dash for anything that is not a finite number", () => {
    expect(formatLei(undefined)).toBe("—");
    expect(formatLei("350")).toBe("—");
    expect(formatLei(NaN)).toBe("—");
  });
});

describe("formatMonth", () => {
  it("names the billing month in Romanian", () => {
    expect(formatMonth("2026-03")).toBe("martie 2026");
    expect(formatMonth("2026-12")).toBe("decembrie 2026");
  });

  it("accepts a full date and reads only the month from it", () => {
    expect(formatMonth("2026-01-31")).toBe("ianuarie 2026");
  });

  it("returns anything it does not understand unchanged", () => {
    expect(formatMonth("")).toBe("");
    expect(formatMonth("2026-13")).toBe("2026-13");
    expect(formatMonth("martie")).toBe("martie");
  });
});

describe("formatPercent", () => {
  it("prints a share as a whole percentage", () => {
    expect(formatPercent(0.4)).toBe("40%");
    expect(formatPercent(0.655)).toBe("66%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("dashes anything that is not a number", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(Number.NaN)).toBe("—");
  });
});

describe("ageOn", () => {
  it("counts whole years", () => {
    expect(ageOn("2018-03-16", "2026-09-05")).toBe(8);
  });

  it("has not counted the birthday that has not happened yet this year", () => {
    expect(ageOn("2018-10-01", "2026-09-05")).toBe(7);
  });

  it("counts the birthday on the day itself", () => {
    expect(ageOn("2018-09-05", "2026-09-05")).toBe(8);
    expect(ageOn("2018-09-06", "2026-09-05")).toBe(7);
  });

  it("does not go through Date, so the answer cannot slip a day east of Greenwich", () => {
    // The trap: `new Date("2018-01-01")` is UTC midnight, which is 02:00 in Bucharest — and read
    // back through local components it is still 1 January, but the same trick on 31 December
    // returns the 30th. Comparing the strings' own integers has no such edge.
    expect(ageOn("2018-01-01", "2026-01-01")).toBe(8);
    expect(ageOn("2018-12-31", "2026-12-31")).toBe(8);
  });

  it("answers null for anything that is not a date, rather than NaN", () => {
    expect(ageOn("", "2026-09-05")).toBeNull();
    expect(ageOn("cândva", "2026-09-05")).toBeNull();
  });

  it("answers null for a birth date in the future instead of a negative age", () => {
    expect(ageOn("2030-01-01", "2026-09-05")).toBeNull();
  });
});

describe("formatAge", () => {
  it("agrees with the singular", () => {
    expect(formatAge("2025-01-01", "2026-09-05")).toBe("1 an");
    expect(formatAge("2018-03-16", "2026-09-05")).toBe("8 ani");
  });

  it("prints the dash when there is no usable date", () => {
    expect(formatAge("", "2026-09-05")).toBe("—");
  });
});
