import { describe, expect, it } from "vitest";
import { orderByGroup, primaryGroupOf } from "~/composables/useInvoiceWorksheetOrder";
import type { InvoiceWorksheetRow } from "~/types/invoice.types";

/**
 * The order of the issuing screen — E15.
 *
 * The rule exists because of how the screen is actually filled: one group at a time. Somebody opens
 * the Monday timetable, sees the month held four sessions, and types 4 down the column.
 * Alphabetical order scatters that group's children across the page.
 */
const child = (
  childId: number,
  groupId: number | null,
  weekday: number | null,
  groupName: string | null
) => ({ childId, childName: `Copil ${childId}`, groupId, weekday, groupName });

const family = (
  parentId: number,
  parentName: string,
  children: ReturnType<typeof child>[]
): InvoiceWorksheetRow =>
  ({ parentId, parentName, email: null, alreadyInvoiced: false, children }) as InvoiceWorksheetRow;

describe("primaryGroupOf", () => {
  it("picks the earliest weekday when a family spans two groups", () => {
    const spanning = family(1, "Popescu", [child(10, 7, 5, "Vineri"), child(11, 3, 1, "Luni")]);
    // The one a counter working through the week meets first. The other child still shows its own
    // group on its own row, so the choice hides nothing.
    expect(primaryGroupOf(spanning)?.groupName).toBe("Luni");
  });

  it("breaks a same-weekday tie by group name, so the order is not the query's", () => {
    const two = family(1, "Popescu", [child(10, 7, 1, "Scratch"), child(11, 3, 1, "Python")]);
    expect(primaryGroupOf(two)?.groupName).toBe("Python");
  });

  it("answers null for a family with no child in any group", () => {
    expect(primaryGroupOf(family(1, "Popescu", [child(10, null, null, null)]))).toBeNull();
  });
});

describe("orderByGroup", () => {
  it("orders by weekday, so the week reads top to bottom", () => {
    const ordered = orderByGroup([
      family(1, "Zamfir", [child(10, 7, 5, "Vineri")]),
      family(2, "Albu", [child(11, 3, 1, "Luni")]),
    ]);
    expect(ordered.map((f) => f.parentName)).toEqual(["Albu", "Zamfir"]);
  });

  it("keeps a group's families together even when their names say otherwise", () => {
    const ordered = orderByGroup([
      family(1, "Albu", [child(10, 7, 3, "Miercuri")]),
      family(2, "Barbu", [child(11, 3, 1, "Luni")]),
      family(3, "Cristea", [child(12, 3, 1, "Luni")]),
    ]);
    // Alphabetically this would be Albu, Barbu, Cristea — and the Monday column would be split.
    expect(ordered.map((f) => f.parentName)).toEqual(["Barbu", "Cristea", "Albu"]);
  });

  it("falls back to the family name inside one group, so the order is stable", () => {
    const ordered = orderByGroup([
      family(1, "Zamfir", [child(10, 3, 1, "Luni")]),
      family(2, "Albu", [child(11, 3, 1, "Luni")]),
    ]);
    expect(ordered.map((f) => f.parentName)).toEqual(["Albu", "Zamfir"]);
  });

  it("puts families with no group last — there is nothing to count for them", () => {
    const ordered = orderByGroup([
      family(1, "Albu", [child(10, null, null, null)]),
      family(2, "Zamfir", [child(11, 3, 1, "Luni")]),
    ]);
    expect(ordered.map((f) => f.parentName)).toEqual(["Zamfir", "Albu"]);
  });

  it("does not mutate what it was given", () => {
    const input = [
      family(1, "Zamfir", [child(10, 7, 5, "V")]),
      family(2, "Albu", [child(11, 3, 1, "L")]),
    ];
    orderByGroup(input);
    expect(input[0]!.parentName).toBe("Zamfir");
  });
});
