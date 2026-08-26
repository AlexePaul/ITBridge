<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Gestionează Copii</h1>
        <p class="text-muted mt-1">Adaugă sau elimină copii din grup</p>
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

    <div v-if="group" class="space-y-8">
      <!-- Children in Group Section -->
      <UCard class="hover:shadow-lg transition-shadow">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-users" class="text-primary" />
            <h2 class="text-2xl font-bold">Copii în Grup</h2>
            <UBadge color="primary" variant="subtle">
              {{ childrenInGroup.length }}
            </UBadge>
          </div>
        </template>

        <div v-if="childrenInGroup.length > 0" class="space-y-3">
          <div
            v-for="child in childrenInGroup"
            :key="child.id"
            class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div>
              <UBadge variant="subtle" color="secondary" class="w-10 justify-center"
                >#{{ child.id }}</UBadge
              >
              <p class="font-semibold">{{ child.firstName }} {{ child.lastName }}</p>
            </div>
            <UButton
              color="info"
              variant="soft"
              size="sm"
              icon="i-lucide-minus"
              @click="handleRemoveChild(child.id)"
            >
              Elimină
            </UButton>
          </div>
        </div>

        <div v-else class="text-center py-8">
          <UIcon name="i-lucide-inbox" class="mx-auto text-4xl text-muted mb-3" />
          <p class="text-muted">Nu sunt copii în acest grup</p>
        </div>
      </UCard>

      <!-- Add Children Section -->
      <UCard class="hover:shadow-lg transition-shadow">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-plus" class="text-secondary" />
            <h2 class="text-2xl font-bold">Adaugă Copii</h2>
            <UBadge color="secondary" variant="subtle">
              {{ childrenWithoutGroup.length }}
            </UBadge>
          </div>
        </template>

        <div v-if="childrenWithoutGroup.length > 0" class="space-y-3">
          <div
            v-for="child in childrenWithoutGroup"
            :key="child.id"
            class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div>
              <UBadge variant="subtle" color="secondary" class="w-10 justify-center"
                >#{{ child.id }}</UBadge
              >
              <p class="font-semibold">{{ child.firstName }} {{ child.lastName }}</p>
            </div>
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-plus"
              @click="handleAddChild(child.id)"
            >
              Adaugă
            </UButton>
          </div>
        </div>

        <div v-else class="text-center py-8">
          <UIcon name="i-lucide-check-circle" class="mx-auto text-4xl text-success mb-3" />
          <p class="text-muted">Toți copii sunt asignați unui grup</p>
        </div>
      </UCard>

      <!-- Save Changes -->
      <div class="flex gap-3 justify-center">
        <UButton color="primary" variant="subtle" size="md" class="w-40" @click="handleSaveChanges">
          Salvează Modificări
        </UButton>
        <UButton color="primary" variant="outline" size="md" class="w-40" @click="handleBack">
          Anulare
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <UCard v-else class="hover:shadow-lg transition-shadow">
      <div class="flex justify-center items-center py-8">
        <UIcon name="i-lucide-loader" class="animate-spin mr-2" />
        <span>Se încarcă...</span>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { useNotifications } from "~/composables/useNotifications";
import { useGroupsStore } from "~/stores/groupsStore";
import { useChildrenStore } from "~/stores/childrenStore";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import type { Group } from "~/types/group.types";
import type { Child } from "~/types/child.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionează Copii",
});

const route = useRoute();
const { success, error } = useNotifications();
const groupsStore = useGroupsStore();
const childrenStore = useChildrenStore();
const childrenApi = useChildrenApi();

const group: Ref<Group | null> = ref(null);
const childrenInGroup: Ref<Child[]> = ref([]);
const childrenWithoutGroup: Ref<Child[]> = ref([]);
const isLoading = ref(false);

onMounted(() => {
  const groupId = route.params.groupId as string;
  group.value = groupsStore.getGroupById(groupId) || null;

  if (group.value) {
    childrenInGroup.value = childrenStore.getChildrenByGroupId(groupId);
    childrenWithoutGroup.value = childrenStore.getChildrenWithoutGroup();
  } else {
    error("Grupul nu a fost găsit");
    navigateTo("/admin/groups");
  }
});

const handleBack = () => {
  navigateTo("/admin/groups");
};

const handleAddChild = async (childId: string) => {
  try {
    isLoading.value = true;
    const groupId = group.value?.id as string | number;
    await childrenApi.addChildToGroup(childId, String(groupId));

    // Move child from without group to in group (for UI)
    const childIndex = childrenWithoutGroup.value.findIndex((c) => c.id === childId);
    if (childIndex !== -1) {
      const child = childrenWithoutGroup.value.splice(childIndex, 1)[0];
      childrenInGroup.value.push(child as Child);
    }
    success("Copil adăugat la grup");
  } catch (err: any) {
    error(err?.message || "Eroare la adăugarea copilului");
  } finally {
    isLoading.value = false;
  }
};

const handleRemoveChild = async (childId: string) => {
  try {
    isLoading.value = true;
    const groupId = group.value?.id as string | number;
    await childrenApi.removeChildFromGroup(childId, String(groupId));

    // Move child from in group to without group (for UI)
    const childIndex = childrenInGroup.value.findIndex((c) => c.id === childId);
    if (childIndex !== -1) {
      const child = childrenInGroup.value.splice(childIndex, 1)[0];
      childrenWithoutGroup.value.push(child as Child);
    }
    success("Copil eliminat din grup");
  } catch (err: any) {
    error(err?.message || "Eroare la eliminarea copilului");
  } finally {
    isLoading.value = false;
  }
};

const handleSaveChanges = () => {
  success("Modificări salvate cu succes");
  navigateTo("/admin/groups");
};
</script>
