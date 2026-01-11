<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Grupe</h1>
        <p class="text-muted mt-1">Gestionează toate grupele școlii după zi și oră</p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="mr-3 ml-auto flex items-center h-11"
        size="lg"
        @click="handleAddGroup"
      >
        <UIcon name="i-lucide-plus" class="mr-2" />
        Adaugă Grup nou
      </UButton>
      <UBadge color="primary" variant="subtle" size="lg" class="h-11 flex items-center px-4">
        {{ groups.length }} total
      </UBadge>
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
  </div>
</template>
<script setup lang="ts">
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { formatTime } from "~/composables/useUtils";
import { useChildrenStore } from "~/stores/childrenStore";
import { useGroupsStore } from "~/stores/groupsStore";
import type { Group } from "~/types/group.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Grupelor",
});

const days = [
  { label: "Luni", id: 1 },
  { label: "Marti", id: 2 },
  { label: "Miercuri", id: 3 },
  { label: "Joi", id: 4 },
  { label: "Vineri", id: 5 },
  { label: "Sambata", id: 6 },
];
const groupsApi = useGroupsApi();
const childrenStore = useChildrenStore();
const groupsStore = useGroupsStore();
const childrenApi = useChildrenApi();

const groups: Ref<Group[]> = ref([]);

onMounted(async () => {
  groups.value = await groupsApi.fetchGroups();
  await childrenApi.fetchChildren();
});

const groupsByDay = (dayId: number) => {
  return groups.value
    .filter((g) => g.weekday === dayId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
};

const handleAddGroup = () => {
  navigateTo("/admin/groups/new");
};

const handleEditGroup = (groupId: number) => {
  navigateTo(`/admin/groups/${groupId}/edit`);
};

const handleManageChildren = (groupId: number) => {
  navigateTo(`/admin/groups/${groupId}/children`);
};
</script>
