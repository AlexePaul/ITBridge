<template>
  <AdminPage title="Evidență grupă" :subtitle="subtitle" width="xl" back-to="/admin/attendance">
    <AdminLoading v-if="loading" />

    <!--
      The three states this screen shipped without. `fetchGroups` was awaited unguarded, so a
      failing API left `groups` empty and drew the picker with no cards and no sentence — on the
      first step of marking a register, which reads as "the school has no groups". The occupancy
      call below it was already wrapped, so the failure path had been thought about for the second
      call and missed for the first.
    -->
    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <AdminEmpty
      v-else-if="selectableGroups.length === 0"
      title="Nicio grupă activă la această locație."
      description="Grupele inactive nu apar aici. Schimbă locația din antet sau activează o grupă din /admin/groups."
      icon="i-lucide-users"
    />

    <!-- Form Card -->
    <UCard v-else class="hover:shadow-lg transition-shadow">
      <template #header>
        <h2 class="text-2xl font-bold">Selectează Grup</h2>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Group Selection Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <!--
            Picking one of the groups, so these are radio buttons — not `div`s with `@click`, which
            take no focus and answer no key (E18/S6). This screen is the first step of marking a
            register, and none of it could be done from a keyboard before. The input is hidden
            visually rather than removed: `sr-only` leaves it focusable and readable, and the card
            stays exactly what is seen. With radios, the arrow keys move from one group to the next
            — the behaviour somebody choosing one item from a list expects.
          -->
          <template v-for="group in selectableGroups" :key="group.id">
            <label class="block cursor-pointer">
              <input
                v-model="groupId"
                type="radio"
                name="attendance-group"
                :value="group.id"
                class="sr-only peer"
              />
              <span
                class="block rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
              >
                <GroupCard
                  :group="group"
                  :occupancy="occupancyByGroup.get(group.id)"
                  :show-edit="false"
                  :show-manage-children="false"
                  :show-weekday="true"
                  :is-selected="groupId === group.id"
                />
              </span>
            </label>
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
import { apiErrorMessage } from "~/composables/useApiError";
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
const loading = ref(true);
const loadError = ref("");

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

/**
 * Both calls, with the difference between them kept: the groups are the screen, the occupancy is
 * a detail on it.
 *
 * `loading` and `loadError` are set **before** the request, not in the `catch` — a retry that does
 * not clear the error first gets its data and leaves the error card sitting on top of it, which is
 * the trap `retry-clears-error.spec.ts` sweeps for.
 */
const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    groups.value = await groupsApi.fetchGroups();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca grupele.");
    return;
  } finally {
    loading.value = false;
  }

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
};

onMounted(load);
</script>
