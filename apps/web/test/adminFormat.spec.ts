import { describe, expect, it } from "vitest";
import {
  formatDateKey,
  formatLei,
  formatMonth,
  formatPercent,
  formatSeats,
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

/**
 * Seats — E18/S5b, and D7.
 *
 * The group card used to print the length of the enrolled-children list, which has no trials in
 * it, so a full group advertised a free seat on the screen where somebody picks a group for a
 * child. The count now comes from the server; what is held here is that the formatter refuses to
 * invent one when it has not arrived, because a wrong number reads exactly like a right one.
 */
describe("formatSeats", () => {
  it("prints the counted seats against the capacity", () => {
    expect(formatSeats(7, 10)).toBe("7 din 10 locuri ocupate");
    expect(formatSeats(0, 10)).toBe("0 din 10 locuri ocupate");
  });

  it("says a full group is full", () => {
    expect(formatSeats(10, 10)).toBe("10 din 10 locuri ocupate");
  });

  it("dashes the count it has not been given, rather than guessing zero", () => {
    expect(formatSeats(undefined, 10)).toBe("— din 10 locuri ocupate");
    expect(formatSeats(null, 10)).toBe("— din 10 locuri ocupate");
    expect(formatSeats(Number.NaN, 10)).toBe("— din 10 locuri ocupate");
  });
});
