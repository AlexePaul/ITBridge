<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Copii</h1>
        <p class="text-muted mt-1">Vizualizează și gestionează toți copiii</p>
      </div>
      <div class="flex items-center gap-3">
        <UBadge color="primary" variant="subtle" size="lg" class="h-11 flex items-center px-4">
          {{ filteredChildren.length }} total
        </UBadge>
      </div>
    </div>

    <!-- Filters Card -->
    <UCard class="border">
      <p class="text-muted text-sm">
        <UIcon name="i-lucide-chevron-down" class="inline-block ml-1" />
        Folosește caseta de căutare pentru a filtra copiii după nume, nume părintelui, telefon
        părinte, email sau ID grup.
      </p>
      <div class="grid grid-cols-1 gap-4">
        <UInput
          v-model="filters.search"
          placeholder="Caută după copil, părinte sau grup..."
          icon="i-lucide-search"
          color="primary"
        >
          <template #trailing>
            <UButton
              v-if="filters.search"
              color="neutral"
              variant="link"
              icon="i-lucide-x"
              :padded="false"
              @click="filters.search = ''"
            />
          </template>
        </UInput>
      </div>

      <div class="flex justify-between items-center mt-4 pt-4 border-t">
        <div class="text-sm text-muted">
          Afișez {{ filteredChildren.length }} din {{ children.length }} copii
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-refresh-cw"
          @click="clearFilters"
          :disabled="!hasActiveFilters"
        >
          Șterge Filtre
        </UButton>
      </div>
    </UCard>

    <!-- Table Card -->
    <UCard class="border">
      <UTable ref="table" :data="filteredChildren" :columns="columns" class="w-full" />
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { Child } from "~/types/child.types";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { formatTime, getWeekdayName } from "~/composables/useUtils";

const childrenApi = useChildrenApi();
const UBadge = resolveComponent("UBadge");
const UIcon = resolveComponent("UIcon");
const UDropdownMenu = resolveComponent("UDropdownMenu");
const UButton = resolveComponent("UButton");

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Copii",
});

// Data
const children: Ref<Child[]> = ref([]);

// TODO: Fetch children list from API on mount
onMounted(async () => {
  children.value = await childrenApi.fetchChildren();
});

// Filters
const filters = ref({
  search: "",
});

const hasActiveFilters = computed(() => {
  return !!filters.value.search;
});

const filteredChildren = computed(() => {
  const f = filters.value;
  let result = [...children.value];

  // Global search across name, parent and group
  if (f.search) {
    const s = f.search.toLowerCase();
    result = result.filter((c) => {
      if (s[0] === "#") {
        // If search starts with #, match only by ID
        return (
          `${c.group?.id ?? ""}`.toLowerCase().includes(s.slice(1)) || `${c.id}` === s.slice(1)
        );
      }
      const nameMatch = `${c.firstName} ${c.lastName}`.toLowerCase().includes(s);
      const parentMatch =
        `${c.parent?.firstName ?? ""} ${c.parent?.lastName ?? ""}`.toLowerCase().includes(s) ||
        (c.parent?.email ?? "").toLowerCase().includes(s) ||
        (c.parent?.phone ?? "").includes(s);
      const groupMatch = `${c.group?.id ?? ""}`.toLowerCase().includes(s);
      return nameMatch || parentMatch || groupMatch;
    });
  }

  return result;
});

const clearFilters = () => {
  filters.value = { search: "" };
};

// Table columns
const columns: TableColumn<Child>[] = [
  {
    accessorKey: "id",
    header: "#",
    cell: ({ row }) =>
      h(
        UBadge,
        { class: "capitalize", variant: "subtle", color: "primary" },
        () => `#${row.getValue("id")}`
      ),
  },
  {
    id: "name",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-baby", class: "text-secondary" }),
        h("span", "Nume"),
      ]),
    cell: ({ row }) => {
      const firstName = row.original.firstName || "";
      const lastName = row.original.lastName || "";
      return `${firstName} ${lastName}`.trim() || h("span", { class: "text-muted" }, "N/A");
    },
  },
  {
    accessorKey: "birthDate",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-calendar", class: "text-secondary" }),
        h("span", "Data Nașterii"),
      ]),
  },
  {
    accessorKey: "createdAt",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-clock", class: "text-secondary" }),
        h("span", "Creat"),
      ]),
  },
  {
    id: "parent",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-user", class: "text-secondary" }),
        h("span", "Părinte"),
      ]),
    cell: ({ row }) => {
      const p = row.original.parent;
      if (!p) return h("span", { class: "text-muted" }, "N/A");
      return (
        `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() ||
        p.email ||
        p.phone ||
        h("span", { class: "text-muted" }, "N/A")
      );
    },
  },
  {
    id: "group",
    header: () =>
      h("div", { class: "flex items-center gap-2" }, [
        h(UIcon, { name: "i-lucide-users", class: "text-secondary" }),
        h("span", "Grup"),
      ]),
    cell: ({ row }) => {
      const g = row.original.group;
      if (!g) return h("span", { class: "text-muted" }, "N/A");
      return `#${g.id} • ${getWeekdayName(g.weekday)} • ${formatTime(g.startTime)} - ${formatTime(g.endTime)}`;
    },
  },
  {
    id: "actions",
    enableHiding: false,
    meta: { class: { td: "text-right" } },
    cell: ({ row }) => {
      const items = [
        { type: "label", label: "Acțiuni" },
        {
          type: "link",
          label: "Vizualizează Părinte",
          icon: "i-lucide-user",
          to: `/admin/profiles/${row.original.parent?.id}`,
        },
        {
          type: "link",
          label: "Editare Copil",
          icon: "i-lucide-baby",
          to: `/admin/children/${row.original.id}/edit`,
        },
        {
          type: "link",
          label: "Șterge Copil",
          icon: "i-lucide-trash",
          to: `/admin/children/${row.original.id}/confirmation`,
        },
        { type: "separator" },
        {
          type: "link",
          label: "Vizualizează Grup",
          icon: "i-lucide-users",
          to: row.original.group ? `/admin/groups` : null,
          disabled: !row.original.group,
        },
      ];

      return h(
        UDropdownMenu,
        { content: { align: "end" }, items, "aria-label": "Actions dropdown" },
        () =>
          h(UButton, {
            icon: "i-lucide-ellipsis-vertical",
            color: "neutral",
            variant: "ghost",
            "aria-label": "Actions dropdown",
          })
      );
    },
  },
];
</script>
