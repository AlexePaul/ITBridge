<template>
  <AdminPage
    title="Evidență copil"
    subtitle="Prezența unui singur copil, căutat după nume"
    back-to="/admin/attendance"
  >
    <UCard>
      <div class="space-y-3">
        <UFormField label="Caută copil">
          <UInput
            v-model="searchQuery"
            placeholder="Nume sau ID…"
            icon="i-lucide-search"
            color="primary"
            class="w-full"
          />
        </UFormField>

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

        <AdminEmpty
          v-if="searchQuery && searchResults.length === 0"
          bare
          icon="i-lucide-search-x"
          :title="`Niciun rezultat pentru „${searchQuery}”`"
          description="Caută după numele copilului sau după ID."
        />
      </div>
    </UCard>
  </AdminPage>
</template>
<script setup lang="ts">
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useLocationStore } from "~/stores/locationStore";
import type { Child } from "~/types/child.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Prezenței Copiilor",
});

const childrenApi = useChildrenApi();
const locationStore = useLocationStore();
const searchQuery = ref("");
const searchResults: Ref<Child[]> = ref([]);
const allChildren: Ref<Child[]> = ref([]);

const filterChildren = () => {
  if (!searchQuery.value.trim()) {
    searchResults.value = [];
    return;
  }

  const query = searchQuery.value.toLowerCase();
  // The search is scoped to the location in the header, like every other admin list. Children
  // without a group match in any selection — they are unassigned, not elsewhere.
  const inSelection = allChildren.value.filter((child) =>
    locationStore.matchesSelection(child.group?.room?.location.id ?? null)
  );
  searchResults.value = inSelection.filter((child) => {
    const firstNameMatch = child.firstName?.toLowerCase().includes(query) ?? false;
    const lastNameMatch = child.lastName?.toLowerCase().includes(query) ?? false;
    const idMatch = String(child.id).includes(query);
    return firstNameMatch || lastNameMatch || idMatch;
  });
};

const selectChild = (child: Child) => {
  navigateTo(`/admin/attendance/children/${child.id}`);
};

onMounted(async () => {
  allChildren.value = await childrenApi.fetchChildren();
});

watch(searchQuery, () => {
  filterChildren();
});

// Switching location while a search is open has to re-run it, or the results keep describing the
// location the admin has just left.
watch(() => locationStore.selectedLocationId, filterChildren);
</script>
