<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Evidență Grup</h1>
        <p class="text-muted mt-1">Gestionează prezența copiilor dintr-un grup</p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="mr-3 ml-auto flex items-center h-11"
        size="lg"
        @click="handleBack"
      >
        <UIcon name="i-lucide-arrow-left" class="mr-2" />
        Înapoi
      </UButton>
    </div>

    <!-- Form Card -->
    <UCard class="hover:shadow-lg transition-shadow">
      <template #header>
        <h2 class="text-2xl font-bold">Selectează Grup</h2>
      </template>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Group Selection Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <template
            v-for="group in groups
              .sort((a, b) => a.weekday - b.weekday)
              .filter((group) => group.isActive)"
            :key="group.id"
          >
            <div class="cursor-pointer" @click="groupId = group.id">
              <GroupCard
                :group="group"
                :showEdit="false"
                :showManageChildren="false"
                :showWeekday="true"
                :isSelected="groupId === group.id"
              />
            </div>
          </template>
        </div>
        <!-- Submit Button -->
        <div class="flex gap-3 pt-6 border-t border-muted justify-center">
          <UBadge class="mr-auto w-40 text-md" variant="outline" color="primary"
            >Selected Group: {{ groupId }}</UBadge
          >
          <UButton
            type="submit"
            variant="outline"
            :color="!groupId ? 'neutral' : 'primary'"
            size="md"
            :class="['w-40', !groupId ? 'opacity-50 cursor-not-allowed' : '']"
            :disabled="!groupId"
            @click="handleSubmit"
          >
            Continuă
          </UButton>
        </div>
      </form>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useNotifications } from "~/composables/useNotifications";
import type { Group } from "~/types/group.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Prezența unei grupe",
});

const { error } = useNotifications();
const groupId = ref<number | null>(null);
const groups: Ref<Group[]> = ref([]);
const childrenApi = useChildrenApi();
const groupsApi = useGroupsApi();

const handleBack = () => {
  navigateTo("/admin/attendance");
};

const handleSubmit = () => {
  if (!groupId.value) {
    error("ID-ul grupului este obligatoriu");
    return;
  }

  navigateTo(`/admin/attendance/group/${groupId.value}`);
};

onMounted(async () => {
  await childrenApi.fetchChildren();
  groups.value = await groupsApi.fetchGroups();
});
</script>
