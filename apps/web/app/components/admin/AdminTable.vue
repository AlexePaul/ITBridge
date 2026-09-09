<template>
  <UCard class="border">
    <UTable
      :data="rows"
      :columns="tableColumns"
      :loading="loading"
      :meta="tableMeta"
      class="w-full"
    >
      <template #loading>
        <AdminLoading />
      </template>
      <template #empty>
        <AdminEmpty bare :icon="emptyIcon" :title="emptyText" :description="emptyDescription" />
      </template>
      <!-- Pass every named slot through, so `#<key>-cell` escape hatches reach UTable. -->
      <template v-for="(_, name) in $slots" #[name]="slotData" :key="name">
        <slot :name="name" v-bind="slotData ?? {}" />
      </template>
    </UTable>
  </UCard>
</template>

<script setup lang="ts" generic="T">
/**
 * The one table — E18/S5a.
 *
 * Three index screens copy-pasted the same sixty lines of `h()`/`resolveComponent` vocabulary and
 * mutated it independently; a fourth drew a native `<table>` with hand classes; a fifth shipped
 * UTable's untranslated "No data". This owns that vocabulary as declarative config:
 *
 *   <AdminTable :rows="payments" :columns="[
 *     { key: 'id', label: '#', type: 'id' },
 *     { key: 'parent', label: 'Nume', icon: 'i-lucide-user', accessor: (p) => name(p) },
 *     { key: 'status', label: 'Stare', type: 'badge', accessor: (p) => label(p.status),
 *       badgeColor: (p) => color(p.status) },
 *     { key: 'amount', label: 'Sumă', type: 'money' },
 *   ]" />
 *
 * `type: 'date'` formats from string components — never `new Date()` on a date key, which is the
 * UTC trap CLAUDE.md documents. A cell no config fits gets a `#<key>-cell` slot, passed through to
 * UTable. Sorting, filtering and pagination are deliberately absent: every list today fetches
 * everything, and a pagination contract is an API change the undeployed backend does not need yet.
 *
 * **A row that leads somewhere says so with a link, not with `@select`** — E18/S6. `UTable` stamps
 * `role="button" tabindex="0"` on every `<tr>` the moment it is given an `onSelect`, and that one
 * prop bought three defects at once: the row was announced as a button while containing buttons of
 * its own (`nested-interactive`, seventeen rows across `/admin/children` and `/admin/reduceri`); it
 * took a tab stop it could not honour, because a `<tr>` gets no free Enter or Space the way a real
 * `<button>` does, so a keyboard could reach it and never open it; and "button" told the reader
 * nothing about where pressing it would go.
 *
 * All five callers were navigating, so `:to` replaces the emit: the first cell becomes a real
 * `NuxtLink`, which is focusable, activates on Enter, announces its destination, and can be opened
 * in a new tab like any other link on the web. Clicking anywhere in the row still works — the link
 * stretches over it through `after:absolute after:inset-0` against a `relative` row — so nothing is
 * lost at the mouse.
 *
 * **That overlay covers every cell, which is the price of the pattern.** A `<td>` is not positioned,
 * so it paints below the link's absolutely-positioned `::after`; hit-testing the middle of a row
 * returns the link, not the cell under the cursor. The actions column escapes on its own
 * `relative z-10` — without it the row's link would swallow every menu press — and any other column
 * that puts a control in a cell needs the same. That is what `interactive: true` on a column is
 * for. It is worth stating rather than leaving to be discovered: nothing about a dead button in the
 * third column points back at a link in the first.
 */
import { h, resolveComponent } from "vue";
import type { TableColumn, DropdownMenuItem } from "@nuxt/ui";
import type { TableRow } from "@nuxt/ui";
import AdminLoading from "./AdminLoading.vue";
import AdminEmpty from "./AdminEmpty.vue";
import { formatDateKey, formatLei } from "~/composables/useAdminFormat";
import type { AdminTableColumn } from "~/types/admin-ui.types";

const props = withDefaults(
  defineProps<{
    rows: T[];
    columns: AdminTableColumn<T>[];
    loading?: boolean;
    emptyText?: string;
    emptyDescription?: string;
    emptyIcon?: string;
    /** Renders the right-aligned ellipsis dropdown; return the row's menu. */
    actions?: (row: T) => DropdownMenuItem[];
    /** Where the row leads. Given, the first cell becomes the link that takes you there. */
    to?: (row: T) => string;
  }>(),
  {
    loading: false,
    emptyText: "Nimic de afișat.",
    emptyDescription: undefined,
    emptyIcon: "i-lucide-inbox",
    actions: undefined,
    to: undefined,
  }
);

/** The row is the link's containing block, so the stretch covers the row and stops there. */
const tableMeta = computed(() => (props.to ? { class: { tr: "relative" } } : undefined));

const UBadge = resolveComponent("UBadge");
const NuxtLink = resolveComponent("NuxtLink");
const UIcon = resolveComponent("UIcon");
const UButton = resolveComponent("UButton");
const UDropdownMenu = resolveComponent("UDropdownMenu");

const dash = () => h("span", { class: "text-muted" }, "—");

function cellFor(column: AdminTableColumn<T>, row: T) {
  const value = column.accessor
    ? column.accessor(row)
    : (row as Record<string, unknown>)[column.key];

  if (column.type === "id") {
    return h(UBadge, { variant: "subtle", color: "primary" }, () => `#${String(value)}`);
  }
  if (column.type === "badge") {
    if (value === null || value === undefined || value === "") return dash();
    const color = column.badgeColor ? column.badgeColor(row) : "neutral";
    return h(UBadge, { variant: "subtle", color }, () => String(value));
  }
  if (column.type === "date") {
    return typeof value === "string" && value ? formatDateKey(value) : dash();
  }
  if (column.type === "money") {
    return h("div", { class: "text-right tabular-nums" }, formatLei(value));
  }
  if (value === null || value === undefined || value === "") return dash();
  return String(value);
}

/**
 * What names a row: the first column of **words**.
 *
 * The typed columns are all skipped, and each for the same reason — none of them says which row
 * this is. An id is the number the name exists to replace; an amount and a date are facts about the
 * row rather than its identity; and a badge is a status, which is the one that had to be learnt the
 * hard way: `/admin/profiles` puts "Are cont" second, so taking the first non-numeric column named
 * nine row menus "Acțiuni pentru Da" and three "Acțiuni pentru Nu".
 */
const NOT_A_NAME = new Set(["id", "money", "badge", "date"]);

function rowName(row: T): string {
  for (const column of props.columns) {
    if (column.type && NOT_A_NAME.has(column.type)) continue;
    const value = column.accessor
      ? column.accessor(row)
      : (row as Record<string, unknown>)[column.key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

/**
 * The name each row's actions button answers to — "Acțiuni pentru Popescu Ana".
 *
 * A list of twenty rows used to be a list of twenty buttons all called "Acțiuni", which is a list
 * a reader moving by control cannot navigate: the row is the context on screen, and off screen
 * there is no row.
 *
 * **Names are made unique against the other rows, not just taken from the cell.** Two children
 * called Andrei Ionescu is not a data error, it is two children — and `/admin/children` had
 * exactly that, so naming each button after its cell produced two buttons with one name and moved
 * the problem rather than fixing it. A repeated name takes the row's id, which is the column the
 * table is already showing beside it; a table with no id falls back to the row's position. Nothing
 * suitable at all (a table of numbers and amounts) keeps the bare verb rather than inventing
 * something.
 *
 * Keyed by row identity, so a name is computed once per render pass rather than once per cell.
 */
const rowLabels = computed(() => {
  const names = props.rows.map((row) => rowName(row));
  const seen = new Map<string, number>();
  for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);

  return new Map<T, string>(
    props.rows.map((row, index) => {
      const name = names[index] ?? "";
      if (!name) return [row, ""];
      if ((seen.get(name) ?? 0) === 1) return [row, name];
      const id = (row as Record<string, unknown>).id;
      return [row, id === undefined ? `${name} (${index + 1})` : `${name} #${String(id)}`];
    })
  );
});

const tableColumns = computed<TableColumn<T>[]>(() => {
  const defs: TableColumn<T>[] = props.columns.map((column, index) => ({
    id: column.key,
    // Only when there is an overlay to escape; an unconditional `relative` would change stacking
    // on every table for the benefit of the ones that do not have one.
    ...(column.interactive && props.to ? { meta: { class: { td: "relative z-10" } } } : {}),
    header: () => {
      const label =
        column.type === "money" || column.align === "right"
          ? h("div", { class: "text-right" }, column.label)
          : h("span", column.label);
      if (!column.icon) return label;
      return h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: column.icon, class: "text-secondary" }),
        label,
      ]);
    },
    cell: ({ row }: { row: TableRow<T> }) => {
      const content = cellFor(column, row.original);
      if (!props.to || index > 0) return content;
      return h(
        NuxtLink,
        {
          to: props.to(row.original),
          class:
            "font-medium hover:underline rounded-xs after:absolute after:inset-0 " +
            "focus-visible:outline-2 focus-visible:outline-offset-2",
        },
        () => content
      );
    },
  }));

  if (props.actions) {
    defs.push({
      id: "actions",
      meta: { class: { td: "text-right relative z-10" } },
      cell: ({ row }: { row: TableRow<T> }) => {
        const name = rowLabels.value.get(row.original) ?? "";
        const label = name ? `Acțiuni pentru ${name}` : "Acțiuni";
        return h(
          UDropdownMenu,
          { content: { align: "end" }, items: props.actions!(row.original), "aria-label": label },
          () =>
            h(UButton, {
              icon: "i-lucide-ellipsis-vertical",
              color: "neutral",
              variant: "ghost",
              "aria-label": label,
            })
        );
      },
    });
  }

  return defs;
});
</script>
