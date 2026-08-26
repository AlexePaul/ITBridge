<template>
  <!-- Header -->
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold">
            Prezența Grupa {{ $route.params.groupId }} -
            {{ getWeekdayName(group?.weekday as number) }},
            {{ formatTime((group?.startTime as string) || "00:00:00") }} -
            {{ formatTime((group?.endTime as string) || "23:59:59") }}
          </h1>
          <p class="text-muted mt-1">Gestionează prezența copiilor din grupa</p>
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
      <div class="w-1/3 mx-auto">
        <template v-for="child in children" :key="child.id">
          <UCard class="mb-4">
            <template #header>
              <div class="items-center justify-between flex">
                <UBadge color="secondary" variant="subtle" size="lg" class="w-10 justify-center">
                  #{{ child.id }}
                </UBadge>
                <template v-if="child?.group?.id != groupId">
                  <UButton
                    icon="i-lucide-x"
                    variant="ghost"
                    color="warning"
                    @click="removeChildFromList(child.id)"
                  />
                </template>
              </div>
            </template>
            <template #default>
              <div class="items-center justify-between flex">
                <span class="inline-block text-lg">{{
                  child.firstName + " " + child.lastName
                }}</span>
                <USwitch
                  unchecked-icon="i-lucide-x"
                  checked-icon="i-lucide-check"
                  class="inline-block"
                  size="lg"
                  color="success"
                  v-model="attendanceData[String(child.id)]"
                >
                  Prezent</USwitch
                >
              </div>
            </template>
          </UCard>
        </template>
        <UCard>
          <template #header>
            <h1>Adauga copii de la alte grupe</h1>
          </template>
          <template #default>
            <div class="space-y-3 relative">
              <div>
                <UInput
                  v-model="searchQuery"
                  placeholder="Cauta copil dupa nume sau ID..."
                  icon="i-lucide-search"
                  color="primary"
                  class="w-full"
                  @input="filterChildren"
                />
              </div>
            </div>
            <template v-for="child in filteredChildren">
              <UCard class="mt-2 cursor-pointer" @click="addChildToList(child)">
                <div class="items-center justify-between flex">
                  <span class="inline-block text-lg">{{
                    child.firstName + " " + child.lastName
                  }}</span>
                  <UBadge color="secondary" variant="subtle" size="md" class="w-10 justify-center">
                    #{{ child.id }}
                  </UBadge>
                </div>
              </UCard>
            </template>
          </template>
        </UCard>
        <!-- Dropdown Results (outside card) -->
      </div>
    </template>
    <template #footer>
      <div class="flex items-end gap-4 w-1/2 mx-auto mt-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="text-sm font-semibold mb-2 block">Data</label>
            <UInput v-model="attendanceDate" type="date" placeholder="Selectează data..." />
          </div>
          <div>
            <label class="text-sm font-semibold mb-2 block">Ora de început</label>
            <UInput v-model="attendanceStartTime" type="time" placeholder="Selectează ora..." />
          </div>
        </div>
        <UModal title="Confirmare Salvare Prezență">
          <UButton class="ml-auto" color="primary" size="lg">Salvează Prezența</UButton>
          <template #body>
            <div class="space-y-4">
              <p class="text-lg">
                Ești sigur că dorești să salvezi prezența pentru grupa
                {{ group?.id }} pe data de {{ attendanceDate }}?
              </p>
              <div class="flex gap-3 pt-2">
                <UButton
                  type="button"
                  size="lg"
                  class="flex-1 justify-center"
                  variant="solid"
                  @click="handleSubmit"
                  >Confirmă</UButton
                >
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </UCard>

  <!-- Confirmation Dialog -->
  <UModal title="Modal with title">
    <template #body>
      <Placeholder class="h-48" />
    </template>
  </UModal>
</template>
<script setup lang="ts">
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import { useChildrenStore } from "~/stores/childrenStore";
import { useGroupsStore } from "~/stores/groupsStore";
import type { Child } from "~/types/child.types";
import type { Group } from "~/types/group.types";

const route = useRoute();
const childrenStore = useChildrenStore();
const childrenApi = useChildrenApi();
const children: Ref<Child[]> = ref([]);
const searchQuery = ref("");
const filteredChildren: Ref<Child[]> = ref([]);
const availableChildren: Ref<Child[]> = ref([]);
const groupsStore = useGroupsStore();
const groupsApi = useGroupsApi();
const group = ref<Group>();
const attendanceData = reactive<Record<string, boolean>>({});
const attendanceDate = ref<string>(new Date().toISOString().split("T")[0] as string);
const attendanceStartTime = ref<string>("");
const attendanceApi = useAttendanceApi();

const groupId = computed(() => route.params.groupId as string);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Înregistrarea Prezenței pe Grup",
});

const filterChildren = () => {
  if (!searchQuery.value.trim()) {
    filteredChildren.value = [];
    return;
  }

  const query = searchQuery.value.toLowerCase();
  filteredChildren.value = availableChildren.value.filter(
    (child) =>
      child.firstName.toLowerCase().includes(query) ||
      child.lastName.toLowerCase().includes(query) ||
      String(child.id).includes(query)
  );
};

const addChildToList = (child: Child) => {
  // Avoid duplicates
  if (!children.value.some((c) => c.id === child.id)) {
    children.value.push(child);
    attendanceData[String(child.id)] = true; // Initialize as present
  }
  // Remove from available list
  availableChildren.value = availableChildren.value.filter((c) => c.id !== child.id);
  // Clear search
  searchQuery.value = "";
  filteredChildren.value = [];
};

const removeChildFromList = (childId: string) => {
  children.value = children.value.filter((c) => c.id !== childId);
  delete attendanceData[String(childId)];
  availableChildren.value.push(childrenStore.getChildById(childId) as Child);
};

onMounted(async () => {
  await childrenApi.fetchChildren();
  children.value = await childrenStore.getChildrenByGroupId(groupId.value);
  availableChildren.value = await childrenStore.getChildrenNotInGroupId(groupId.value);
  await groupsApi.fetchGroups();
  group.value = groupsStore.getGroupById(groupId.value as string);

  // Initialize attendance data map with all group children
  children.value.forEach((child) => {
    attendanceData[String(child.id)] = true; // Default to present
  });

  // Set default startTime from group
  if (group.value?.startTime) {
    attendanceStartTime.value = group.value.startTime.substring(0, 5); // HH:MM format
  }
});

const handleBack = () => {
  navigateTo("/admin/attendance/group");
};

const handleSubmit = async () => {
  // Convert attendance map to array for submission
  const submissionData = {
    childrenAttendance: children.value.map((child) => ({
      childId: child.id,
      present: attendanceData[String(child.id)] ?? true,
    })),
    date: attendanceDate.value,
    startTime: attendanceStartTime.value,
  };
  console.log("Submitting attendance data:", submissionData);
  await attendanceApi.markGroupAttendance(parseInt(groupId.value), submissionData);
  navigateTo("/admin/attendance/group");
};
</script>
