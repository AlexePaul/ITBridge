<template>
  <AdminPage title="Grupe" :subtitle="subtitle" width="xl">
    <template #actions>
      <UButton
        color="secondary"
        variant="subtle"
        size="lg"
        class="min-h-11 flex items-center"
        icon="i-lucide-plus"
        to="/admin/groups/new"
      >
        Adaugă grupă nouă
      </UButton>
      <UBadge color="primary" variant="subtle" size="lg" class="min-h-11 flex items-center px-4">
        {{ visibleGroups.length }} total
      </UBadge>
    </template>

    <!--
      Schedule generation, on the page where groups are born.

      A group with no class sessions cannot have its attendance taken, so a brand new group is
      unusable until this runs - and this list is where the admin already is one click after
      creating it. Every active group at once, which is the API's own default: the admin does not
      have to work out which group has run out of horizon, and the run is harmless for the ones
      that have not.
    -->
    <div
      class="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-muted px-4 py-4"
    >
      <UIcon name="i-lucide-calendar-plus" class="text-primary text-2xl" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">Orarul ședințelor</p>
        <p class="text-sm text-muted">
          Scrie următoarele 8 săptămâni de ore pentru toate grupele active ale școlii, din ambele
          locații, începând de azi. O grupă fără ore programate nu poate primi prezență. Poți apăsa
          de câte ori vrei: orele care există deja rămân neatinse, iar cele anulate nu sunt
          reînviate.
        </p>
      </div>
      <UButton
        color="primary"
        variant="solid"
        size="lg"
        class="h-11 flex items-center"
        :loading="isGeneratingSchedule"
        :disabled="isGeneratingSchedule"
        @click="handleGenerateSchedule"
      >
        Generează orarul
      </UButton>
    </div>

    <!-- Days Layout -->
    <div class="space-y-10">
      <template v-for="day in days" :key="day.id">
        <div>
          <!-- Day Header -->
          <div class="flex items-center gap-3 mb-4">
            <UBadge color="primary" variant="subtle" size="lg" class="px-4 py-2">
              {{ day.label }}
            </UBadge>
            <div class="text-sm text-muted">
              {{ groupsByDay(day.id).length }} grup{{ groupsByDay(day.id).length !== 1 ? "e" : "" }}
            </div>
          </div>

          <!-- Groups Grid -->
          <template v-if="groupsByDay(day.id).length > 0">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <template v-for="group in groupsByDay(day.id)" :key="group.id">
                <GroupCard
                  :group="group"
                  :occupancy="occupancyOf(group.id)"
                  @edit="handleEditGroup"
                  @manage-children="handleManageChildren"
                />
              </template>
            </div>
          </template>

          <!-- Empty State -->
          <template v-else>
            <div class="text-center py-12 border border-dashed border-muted rounded-lg">
              <UIcon name="i-lucide-inbox" class="mx-auto text-4xl text-muted mb-3" />
              <p class="text-muted">Nu sunt grupe pentru această zi</p>
            </div>
          </template>
        </div>
      </template>
    </div>
  </AdminPage>
</template>
<script setup lang="ts">
import { WEEKDAYS_IN_ORDER, WEEKDAY_LABELS } from "~/types/group.types";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { generatedScheduleMessage } from "~/composables/useClassSessionSchedule";
import { useGroupOccupancy } from "~/composables/useGroupOccupancy";
import { useNotifications } from "~/composables/useNotifications";
import { useLocationStore } from "~/stores/locationStore";
import type { Group } from "~/types/group.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Grupelor",
});

// The third hand-written copy of this list, and the last one. It stopped at Saturday, so a Sunday
// group — which the API and both group forms accept — rendered in no section at all.
const days = WEEKDAYS_IN_ORDER.map((id) => ({ id, label: WEEKDAY_LABELS[id] }));
const groupsApi = useGroupsApi();

const groups: Ref<Group[]> = ref([]);
const locationStore = useLocationStore();
const classSessionsApi = useClassSessionsApi();
const { success, error } = useNotifications();
const isGeneratingSchedule = ref(false);

// Seats come from the server, per D7 — the children this page could count do not include trials.
// The page used to load every child in the school for that wrong count; now it loads none.
const { occupancyOf, loadFor } = useGroupOccupancy();

onMounted(async () => {
  groups.value = await groupsApi.fetchGroups();
  await loadFor(groups.value.map((group) => group.id));
});

// The header says which location is being shown; this list has to agree with it, or the count and
// the schedule below describe a different school than the one the admin selected.
const visibleGroups = computed(() =>
  groups.value.filter((group) => locationStore.matchesSelection(group.room?.location.id ?? null))
);

const subtitle = computed(() =>
  locationStore.isShowingAll
    ? "Toate grupele școlii, din ambele locații, după zi și oră"
    : `Grupele din ${locationStore.selectedLocation?.name ?? ""}, după zi și oră`
);

const groupsByDay = (dayId: number) => {
  return visibleGroups.value
    .filter((g) => g.weekday === dayId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
};

/**
 * Eight weeks of timetable for every active group, with the API's own defaults: no `groupId`, no
 * `from`, no `weeks`.
 *
 * Deliberately not narrowed to the selected location, and the copy above says so. Filtering it
 * would make the button quietly leave half the school without a timetable, and the operation is
 * idempotent anyway, so there is nothing to be gained by doing less of it.
 */
const handleGenerateSchedule = async () => {
  isGeneratingSchedule.value = true;
  try {
    const result = await classSessionsApi.generateSessions();
    success(generatedScheduleMessage(result));
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut genera orarul."));
  } finally {
    isGeneratingSchedule.value = false;
  }
};

const handleEditGroup = (groupId: number) => {
  navigateTo(`/admin/groups/${groupId}/edit`);
};

const handleManageChildren = (groupId: number) => {
  navigateTo(`/admin/groups/${groupId}/children`);
};
</script>
