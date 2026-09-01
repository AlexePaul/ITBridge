import type { InvoiceWorksheetRow } from "~/types/invoice.types";

/**
 * The order the issuing screen lists families in — by group, not alphabetically — E15.
 *
 * Whoever fills that screen works one group at a time: they open the Monday timetable, see the
 * month held four sessions, and type 4. Alphabetical order scatters a group's children across the
 * page; this puts them in a run.
 *
 * Pure, and separate from the screen, so the rule can be held by a test rather than by clicking.
 */

export type WorksheetChild = InvoiceWorksheetRow["children"][number];

/**
 * The family's group, for ordering: the earliest weekday among its children, then that group's name.
 *
 * A family can have children in two groups, and ordering needs one answer per family. The earliest
 * weekday is the one a counter working through the week meets first. The other child still shows
 * its own group on its own row, so the choice hides nothing.
 */
export function primaryGroupOf(family: InvoiceWorksheetRow): WorksheetChild | null {
  const placed = family.children.filter((child) => child.groupId !== null);
  if (placed.length === 0) return null;
  return [...placed].sort(
    (a, b) =>
      (a.weekday ?? 8) - (b.weekday ?? 8) || (a.groupName ?? "").localeCompare(b.groupName ?? "")
  )[0]!;
}

/** Families with no child in a group sort last: there is nothing to count for them. */
export function orderByGroup(families: InvoiceWorksheetRow[]): InvoiceWorksheetRow[] {
  return [...families].sort((a, b) => {
    const left = primaryGroupOf(a);
    const right = primaryGroupOf(b);
    if (!left && !right) return a.parentName.localeCompare(b.parentName);
    if (!left) return 1;
    if (!right) return -1;
    return (
      (left.weekday ?? 8) - (right.weekday ?? 8) ||
      (left.groupName ?? "").localeCompare(right.groupName ?? "") ||
      a.parentName.localeCompare(b.parentName)
    );
  });
}
