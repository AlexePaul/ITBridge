<template>
  <UCard class="border">
    <UTable
      :data="rows"
      :columns="tableColumns"
      :loading="loading"
      class="w-full"
      @select="onSelect"
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
  }>(),
  {
    loading: false,
    emptyText: "Nimic de afișat.",
    emptyDescription: undefined,
    emptyIcon: "i-lucide-inbox",
    actions: undefined,
  }
);

const emit = defineEmits<{ rowClick: [row: T] }>();

const UBadge = resolveComponent("UBadge");
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
  const defs: TableColumn<T>[] = props.columns.map((column) => ({
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
    cell: ({ row }: { row: TableRow<T> }) => cellFor(column, row.original),
  }));

  if (props.actions) {
    defs.push({
      id: "actions",
      meta: { class: { td: "text-right" } },
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

const onSelect = (_event: Event, row: TableRow<T>) => emit("rowClick", row.original);
</script>
