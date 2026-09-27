import { describe, expect, it } from "vitest";
import { countOf, daysWaitedLabel } from "~/composables/useRomanianCount";

describe("countOf", () => {
  it("puts the singular after one, and the plural after the rest", () => {
    expect(countOf(1, "familie", "familii")).toBe("1 familie");
    expect(countOf(0, "familie", "familii")).toBe("0 familii");
    expect(countOf(2, "familie", "familii")).toBe("2 familii");
    expect(countOf(19, "minut", "minute")).toBe("19 minute");
  });

  it("puts „de” from twenty up, when the last two digits are 00 or 20–99", () => {
    expect(countOf(20, "familie", "familii")).toBe("20 de familii");
    expect(countOf(45, "zi", "zile")).toBe("45 de zile");
    expect(countOf(100, "familie", "familii")).toBe("100 de familii");
    expect(countOf(101, "familie", "familii")).toBe("101 familii");
    expect(countOf(115, "familie", "familii")).toBe("115 familii");
    expect(countOf(120, "familie", "familii")).toBe("120 de familii");
  });
});

/**
 * The erasure queue printed „0 zile" beside a request made today (QA of 27 September 2026) — a
 * figure where anybody would say a word.
 */
describe("daysWaitedLabel", () => {
  it("says „azi” for today and „ieri” for yesterday", () => {
    expect(daysWaitedLabel(0)).toBe("azi");
    expect(daysWaitedLabel(1)).toBe("ieri");
  });

  it("counts the rest through countOf", () => {
    expect(daysWaitedLabel(2)).toBe("2 zile");
    expect(daysWaitedLabel(19)).toBe("19 zile");
    expect(daysWaitedLabel(30)).toBe("30 de zile");
  });
});
