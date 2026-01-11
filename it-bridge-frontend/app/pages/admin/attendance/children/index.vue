<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold">Evidență Copil</h1>
          <p class="text-muted mt-1">Gestionează prezența copiilor</p>
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
    </template>
    <template #default>
      <div class="space-y-3">
        <div>
          <label class="text-sm font-semibold mb-2 block">Cauta copil</label>
          <UInput
            v-model="searchQuery"
            placeholder="Cauta copil dupa nume sau ID..."
            icon="i-lucide-search"
            color="primary"
            class="w-full"
          />
        </div>

        <!-- Search Results -->
        <div v-if="searchResults.length > 0" class="space-y-3 pt-4 border-t border-muted">
          <p class="text-sm font-semibold text-muted">Rezultate căutare:</p>
          <div
            v-for="child in searchResults"
            :key="child.id"
            class="flex items-center justify-between p-3 rounded-lg border border-muted hover:bg-muted/50 transition-colors cursor-pointer"
            @click="selectChild(child)"
          >
            <div class="flex-1">
              <p class="font-semibold">{{ child.firstName }} {{ child.lastName }}</p>
              <p class="text-sm text-muted">ID: {{ child.id }}</p>
            </div>
            <UIcon name="i-lucide-arrow-right" class="text-muted" />
          </div>
        </div>

        <div v-if="searchQuery && searchResults.length === 0" class="text-center py-6 text-muted">
          Niciun rezultat pentru "{{ searchQuery }}"
        </div>
      </div>
    </template>
  </UCard>
</template>
<script setup lang="ts">
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import type { Child } from "~/types/child.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Prezenței Copiilor",
});

const childrenApi = useChildrenApi();
const searchQuery = ref("");
const searchResults: Ref<Child[]> = ref([]);
const allChildren: Ref<Child[]> = ref([]);

const filterChildren = () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }

  const query = searchQuery.value.toLowerCase();
  searchResults.value = allChildren.value.filter((child) => {
    const firstNameMatch = child.firstName?.toLowerCase().includes(query) ?? false;
    const lastNameMatch = child.lastName?.toLowerCase().includes(query) ?? false;
    const idMatch = String(child.id).includes(query);
    return firstNameMatch || lastNameMatch || idMatch;
  });
};

const selectChild = (child: Child) => {
  navigateTo(`/admin/attendance/children/${child.id}`);
};

const handleBack = () => {
  navigateTo("/admin/attendance");
};

onMounted(async () => {
  allChildren.value = await childrenApi.fetchChildren();
});

watch(searchQuery, () => {
  filterChildren();
});
</script>
