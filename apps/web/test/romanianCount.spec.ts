import { describe, expect, it } from "vitest";
import { countOf } from "~/composables/useRomanianCount";

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
