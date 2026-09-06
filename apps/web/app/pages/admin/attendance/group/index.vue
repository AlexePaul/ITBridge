<template>
  <AdminPage title="Evidență grupă" :subtitle="subtitle" width="xl" back-to="/admin/attendance">
    <!-- Form Card -->
    <UCard class="hover:shadow-lg transition-shadow">
      <template #header>
        <h2 class="text-2xl font-bold">Selectează Grup</h2>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Group Selection Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <template v-for="group in selectableGroups" :key="group.id">
            <div class="cursor-pointer" @click="groupId = group.id">
              <GroupCard
                :group="group"
                :occupancy="occupancyByGroup.get(group.id)"
                :show-edit="false"
                :show-manage-children="false"
                :show-weekday="true"
                :is-selected="groupId === group.id"
              />
            </div>
          </template>
        </div>
        <!-- Submit Button -->
        <div class="flex gap-3 pt-6 border-t border-muted justify-center">
          <UBadge class="mr-auto text-md" variant="outline" color="primary">
            {{ selectedGroupLabel }}
          </UBadge>
          <UButton
            type="submit"
            variant="outline"
            :color="!groupId ? 'neutral' : 'primary'"
            size="md"
            :class="['w-40 min-h-11', !groupId ? 'opacity-50 cursor-not-allowed' : '']"
            :disabled="!groupId"
          >
            Continuă
          </UButton>
        </div>
      </form>
    </UCard>
  </AdminPage>
</template>

<script setup lang="ts">
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useReportsApi } from "~/composables/api/useReportsApi";
import { useNotifications } from "~/composables/useNotifications";
import { useLocationStore } from "~/stores/locationStore";
import type { Group } from "~/types/group.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Prezența unei grupe",
});

const { error } = useNotifications();
const groupId = ref<number | null>(null);
const groups: Ref<Group[]> = ref([]);
const groupsApi = useGroupsApi();
const locationStore = useLocationStore();

/**
 * Seats per group, keyed by id — the same source `/admin/groups` uses.
 *
 * `occupancyOf` owns the number (D7: active plus trials) and `GET /reports/occupancy` carries it
 * for every group in one call. This page used to load every child in the school so the cards could
 * count them, which left trials out of the figure somebody reads before picking a group. If the
 * call fails the cards name the capacity and say nothing about how full they are.
 */
const reportsApi = useReportsApi();
const occupancyByGroup = ref(
  new Map<number, { taken: number; free: number; capacity: number; waiting: number }>()
);

// Sorted and filtered here rather than in the template: `.sort()` on the array a `v-for` is
// iterating mutates the ref in place on every render.
const selectableGroups = computed(() =>
  groups.value
    .filter((group) => group.isActive && locationStore.matchesSelection(group.room?.location.id))
    .slice()
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
);

const subtitle = computed(() =>
  locationStore.isShowingAll
    ? "Gestionează prezența copiilor dintr-un grup, din ambele locații"
    : `Gestionează prezența grupelor din ${locationStore.selectedLocation?.name ?? ""}`
);

/** Names the group rather than printing its id: the id means nothing to whoever is looking. */
const selectedGroupLabel = computed(() => {
  const selected = groups.value.find((group) => group.id === groupId.value);
  return selected ? `Grupă selectată: ${selected.name}` : "Nicio grupă selectată";
});

const handleSubmit = () => {
  if (!groupId.value) {
    error("ID-ul grupului este obligatoriu");
    return;
  }

  navigateTo(`/admin/attendance/group/${groupId.value}`);
};

onMounted(async () => {
  groups.value = await groupsApi.fetchGroups();
  try {
    const report = await reportsApi.fetchOccupancyReport();
    occupancyByGroup.value = new Map(
      report.groups.map((group) => [
        group.groupId,
        { taken: group.taken, free: group.free, capacity: group.capacity, waiting: group.waiting },
      ])
    );
  } catch {
    // Cards then show the capacity without a fill. See the note on `occupancyByGroup`.
  }
});
</script>
