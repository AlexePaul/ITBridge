import { describe, expect, it } from "vitest";
import { ref } from "vue";
import { folded, nameMatches, useListWindow } from "~/composables/useListWindow";

/**
 * At the size of a three-year school, /admin/restante drew 690 cards and /admin/contracte 300 date
 * fields at once, and drew them all again after every payment (QA of 27 September 2026).
 */
describe("useListWindow", () => {
  it("draws the first rows and says how many are left", () => {
    const rows = ref(Array.from({ length: 250 }, (_, i) => i));
    const { visible, hidden, more } = useListWindow(rows, 100);

    expect(visible.value).toHaveLength(100);
    expect(hidden.value).toBe(150);
    more();
    expect(visible.value).toHaveLength(200);
    more();
    expect(visible.value).toHaveLength(250);
    expect(hidden.value).toBe(0);
  });

  it("keeps what was drawn when the list is read again, so the office stays where it was", () => {
    const rows = ref(Array.from({ length: 250 }, (_, i) => i));
    const { visible, more } = useListWindow(rows, 100);
    more();

    rows.value = rows.value.filter((row) => row !== 150);

    expect(visible.value).toHaveLength(200);
    expect(visible.value).not.toContain(150);
  });
});

describe("nameMatches", () => {
  it("finds a name typed without diacritics, in any case, with stray spaces", () => {
    expect(nameMatches("Ștefan Țăranu", "stefan  taranu ")).toBe(true);
    expect(nameMatches("Ștefan Țăranu", "ȚĂRANU")).toBe(true);
    expect(nameMatches("Ștefan Țăranu", "maria")).toBe(false);
  });

  it("matches everything while the box is empty", () => {
    expect(nameMatches("Ana Pop", "")).toBe(true);
    expect(nameMatches("Ana Pop", "   ")).toBe(true);
  });

  it("folds the way the office types", () => {
    expect(folded("  Mălina   Ionescu ")).toBe("malina ionescu");
  });
});
