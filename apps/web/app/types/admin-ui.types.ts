/**
 * The types of the shared admin components — E18/S5a.
 *
 * In `types/`, not inside the components: `export` is not allowed in a `<script setup>` block, and
 * a screen declaring its columns needs the shape by name.
 */

export type AdminBadgeColor =
  "primary" | "secondary" | "success" | "info" | "warning" | "error" | "neutral";

/** One column of an `<AdminTable>`. See that component's docblock for the vocabulary. */
export interface AdminTableColumn<R> {
  key: string;
  label: string;
  /** Icon rendered in the header, before the label. */
  icon?: string;
  /**
   * `id` → subtle `#id` badge · `badge` → a badge colored by `badgeColor` · `date` → formatted
   * from the `YYYY-MM-DD` string · `money` → right-aligned tabular figure. Default: plain text.
   */
  type?: "text" | "id" | "badge" | "date" | "money";
  /** Reads the cell's value off the row; defaults to `row[key]`. */
  accessor?: (row: R) => unknown;
  badgeColor?: (row: R) => AdminBadgeColor;
  align?: "left" | "right";
}
