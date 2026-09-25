import { describe, expect, it } from "vitest";
import { childMatches } from "~/composables/useChildSearch";

describe("childMatches", () => {
  const maria = { id: 12, firstName: "Maria", lastName: "Popescu" };

  it("finds a child by the whole name, the way the office types it", () => {
    expect(childMatches(maria, "Maria Popescu")).toBe(true);
    expect(childMatches(maria, "popescu maria")).toBe(true);
    expect(childMatches(maria, "  Maria   Pop ")).toBe(true);
  });

  it("still finds a child by one name, or by id", () => {
    expect(childMatches(maria, "mar")).toBe(true);
    expect(childMatches(maria, "Popescu")).toBe(true);
    expect(childMatches(maria, "12")).toBe(true);
  });

  it("does not match another child, or an empty box", () => {
    expect(childMatches(maria, "Maria Ionescu")).toBe(false);
    expect(childMatches(maria, "   ")).toBe(false);
  });
});
