<template>
  <AdminPage title="Copii" :subtitle="subtitle" width="xl">
    <template #actions>
      <UBadge color="primary" variant="subtle" size="lg" class="min-h-11 items-center px-4">
        {{ filteredChildren.length }}
        {{ filteredChildren.length === 1 ? "copil" : "copii" }}
      </UBadge>
    </template>

    <UInput
      v-model="search"
      placeholder="Caută după copil, părinte, telefon, email sau #grupă"
      icon="i-lucide-search"
      size="lg"
      class="w-full max-w-xl"
      :ui="{ base: 'w-full' }"
    >
      <template #trailing>
        <UButton
          v-if="search"
          color="neutral"
          variant="link"
          icon="i-lucide-x"
          aria-label="Șterge căutarea"
          @click="search = ''"
        />
      </template>
    </UInput>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />
    <AdminTable
      v-else
      :rows="filteredChildren"
      :columns="columns"
      :actions="rowActions"
      empty-icon="i-lucide-baby"
      :empty-text="search ? 'Niciun copil nu se potrivește.' : 'Niciun copil încă.'"
      :empty-description="
        search ? 'Încearcă alt nume, telefon sau email.' : 'Copiii apar aici după înregistrare.'
      "
      @row-click="(child) => navigateTo(`/admin/children/${child.id}/edit`)"
    />
  </AdminPage>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { Child } from "~/types/child.types";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatAge } from "~/composables/useAdminFormat";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import { useLocationStore } from "~/stores/locationStore";
import type { AdminTableColumn } from "~/types/admin-ui.types";

/**
 * Every child in the school — E18/S5.
 *
 * Migrated off the third hand-rolled `h()` table onto `AdminTable`, and the columns changed while
 * it moved, because consistency alone would have made the same six columns merely tidier:
 *
 *  - **the `createdAt` cell printed a raw `2026-09-04T16:40:25.566Z`.** Not formatted — the driver's
 *    string, straight through. When a child's row was written is not a fact anybody works from;
 *    it was column three of six.
 *  - **`#12` in a badge** took a whole column to show a database key. Search still accepts `#` for
 *    anybody who has one.
 *  - **one column held four facts**: "Scratch Începători • Luni • 16:00 - 17:30 • Drumul Taberei ·
 *    Sala 1", which is unreadable in a row and unscannable down a column. Split into group, when
 *    and where.
 *  - **age replaces the birth date.** An admin reads this list to place a child, and placement is
 *    by age band (E11/S6); nobody subtracts years from a date in their head fifteen times.
 *
 * The location still travels with the row rather than only in the header: in "toate locațiile" the
 * table really does mix the two addresses, and "Sala 1" alone would not say which building.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Copii",
});

const childrenApi = useChildrenApi();
const locationStore = useLocationStore();

const children = ref<Child[]>([]);
const loading = ref(true);
const loadError = ref("");
const search = ref("");

onMounted(async () => {
  try {
    children.value = await childrenApi.fetchChildren();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca lista de copii");
  } finally {
    loading.value = false;
  }
});

/**
 * A child belongs to a location through their group's room. Children with no group yet stay
 * visible in every selection: they are unassigned, not assigned elsewhere, and they are exactly
 * who an admin opens this page to find.
 */
const childrenInSelection = computed(() =>
  children.value.filter((child) =>
    locationStore.matchesSelection(child.group?.room?.location.id ?? null)
  )
);

const subtitle = computed(() =>
  locationStore.isShowingAll
    ? "Toți copiii, din ambele locații"
    : `Copiii din ${locationStore.selectedLocation?.name ?? ""}, plus cei fără grupă`
);

const filteredChildren = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return childrenInSelection.value;

  // A leading `#` searches the group id and nothing else — the one case where a key is what
  // somebody has in front of them, usually copied from another screen.
  if (term.startsWith("#")) {
    const id = term.slice(1);
    return childrenInSelection.value.filter(
      (child) => `${child.group?.id ?? ""}` === id || `${child.id}` === id
    );
  }

  return childrenInSelection.value.filter((child) => {
    const parent = child.parent;
    return (
      `${child.firstName} ${child.lastName}`.toLowerCase().includes(term) ||
      `${parent?.firstName ?? ""} ${parent?.lastName ?? ""}`.toLowerCase().includes(term) ||
      (parent?.email ?? "").toLowerCase().includes(term) ||
      (parent?.phone ?? "").includes(term) ||
      (child.group?.name ?? "").toLowerCase().includes(term)
    );
  });
});

const columns: AdminTableColumn<Child>[] = [
  {
    key: "name",
    label: "Nume",
    icon: "i-lucide-baby",
    accessor: (child) => `${child.firstName ?? ""} ${child.lastName ?? ""}`.trim(),
  },
  {
    key: "age",
    label: "Vârstă",
    icon: "i-lucide-cake",
    accessor: (child) => (child.birthDate ? formatAge(child.birthDate) : null),
  },
  {
    key: "parent",
    label: "Părinte",
    icon: "i-lucide-user",
    accessor: (child) => {
      const parent = child.parent;
      if (!parent) return null;
      return (
        `${parent.firstName ?? ""} ${parent.lastName ?? ""}`.trim() || parent.email || parent.phone
      );
    },
  },
  {
    key: "group",
    label: "Grupă",
    icon: "i-lucide-users",
    type: "badge",
    accessor: (child) => child.group?.name ?? null,
    badgeColor: (child) => (child.group ? "primary" : "neutral"),
  },
  {
    key: "when",
    label: "Când",
    icon: "i-lucide-clock",
    accessor: (child) => {
      const group = child.group;
      if (!group) return null;
      return `${getWeekdayName(group.weekday)} ${formatTime(group.startTime)}–${formatTime(group.endTime)}`;
    },
  },
  {
    key: "where",
    label: "Unde",
    icon: "i-lucide-map-pin",
    accessor: (child) => {
      const room = child.group?.room;
      return room ? `${room.location.name} · ${room.name}` : null;
    },
  },
];

const rowActions = (child: Child): DropdownMenuItem[] => [
  { label: "Acțiuni", type: "label" },
  { label: "Editează copilul", icon: "i-lucide-pencil", to: `/admin/children/${child.id}/edit` },
  {
    label: "Vezi părintele",
    icon: "i-lucide-user",
    to: child.parent ? `/admin/profiles/${child.parent.id}` : undefined,
    disabled: !child.parent,
  },
  {
    label: "Vezi grupa",
    icon: "i-lucide-users",
    to: child.group ? `/admin/groups/${child.group.id}/children` : undefined,
    disabled: !child.group,
  },
  { type: "separator" },
  {
    label: "Șterge copilul",
    icon: "i-lucide-trash",
    color: "error",
    to: `/admin/children/${child.id}/confirmation`,
  },
];
</script>
