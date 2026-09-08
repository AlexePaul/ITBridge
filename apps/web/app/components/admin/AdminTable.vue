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
 * lost at the mouse. The actions cell sits above that overlay on its own `relative z-10`, or the
 * row's link would swallow every menu press.
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

const tableColumns = computed<TableColumn<T>[]>(() => {
  const defs: TableColumn<T>[] = props.columns.map((column, index) => ({
    id: column.key,
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
      cell: ({ row }: { row: TableRow<T> }) =>
        h(
          UDropdownMenu,
          {
            content: { align: "end" },
            items: props.actions!(row.original),
            "aria-label": "Acțiuni",
          },
          () =>
            h(UButton, {
              icon: "i-lucide-ellipsis-vertical",
              color: "neutral",
              variant: "ghost",
              "aria-label": "Acțiuni",
            })
        ),
    });
  }

  return defs;
});
</script>
