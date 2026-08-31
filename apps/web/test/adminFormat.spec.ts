import { describe, expect, it } from "vitest";
import { formatDateKey, formatLei } from "~/composables/useAdminFormat";

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
