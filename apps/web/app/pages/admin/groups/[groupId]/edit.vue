<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Editează Grup</h1>
        <p class="text-muted mt-1">Modifică detaliile grupului</p>
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
    <UCard v-if="group" class="hover:shadow-lg transition-shadow">
      <UForm :schema="schema" :state="state" class="space-y-6" @submit="handleSubmit">
        <!-- Weekday -->
        <UFormField name="weekday">
          <template #label>Ziua săptămânii<span class="text-error">*</span></template>
          <select
            v-model.number="state.weekday"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
          >
            <option v-for="day in days" :key="day.id" :value="day.id">
              {{ day.label }}
            </option>
          </select>
        </UFormField>

        <!-- Time Range -->
        <div class="grid grid-cols-2 gap-6">
          <UFormField name="startTime">
            <template #label>Ora de început<span class="text-error">*</span></template>
            <UInput type="time" v-model="state.startTime" icon="i-lucide-clock" />
          </UFormField>
          <UFormField name="endTime">
            <template #label>Ora de sfârșit<span class="text-error">*</span></template>
            <UInput type="time" v-model="state.endTime" icon="i-lucide-clock" />
          </UFormField>
        </div>

        <!-- Age Range -->
        <div class="grid grid-cols-2 gap-6">
          <UFormField name="minAge">
            <template #label>Vârsta minimă<span class="text-error">*</span></template>
            <UInput type="number" v-model="state.minAge" icon="i-lucide-users" />
          </UFormField>
          <UFormField name="maxAge">
            <template #label>Vârsta maximă<span class="text-error">*</span></template>
            <UInput type="number" v-model="state.maxAge" icon="i-lucide-users" />
          </UFormField>
        </div>

        <!-- Active Status -->
        <UFormField name="isActive">
          <template #label>Grup Activ<span class="text-error">*</span></template>
          <select
            v-model="state.isActive"
            class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
          >
            <option :value="true">Activ</option>
            <option :value="false">Inactiv</option>
          </select>
        </UFormField>

        <!-- Actions -->
        <div class="flex gap-3 pt-6 border-t border-muted justify-center">
          <UButton type="submit" color="primary" variant="subtle" size="md" class="w-40">
            Salvează
          </UButton>
          <UButton color="primary" variant="outline" size="md" class="w-40" @click="handleBack">
            Anulare
          </UButton>
        </div>
      </UForm>
    </UCard>

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
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useNotifications } from "~/composables/useNotifications";
import { useGroupsStore } from "~/stores/groupsStore";
import type { Group } from "~/types/group.types";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { formatTime } from "~/composables/useUtils";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Editează Grup",
});

const route = useRoute();
const { success, error } = useNotifications();
const groupsStore = useGroupsStore();
const groupsApi = useGroupsApi();

const days = [
  { label: "Luni", id: 1 },
  { label: "Marti", id: 2 },
  { label: "Miercuri", id: 3 },
  { label: "Joi", id: 4 },
  { label: "Vineri", id: 5 },
  { label: "Sambata", id: 6 },
];

const group: Ref<Group | null> = ref(null);

const schema = z.object({
  weekday: z.number().min(1, "Ziua săptămânii este obligatorie"),
  startTime: z.string().min(1, "Ora de început este obligatorie"),
  endTime: z.string().min(1, "Ora de sfârșit este obligatorie"),
  minAge: z.number().min(1, "Vârsta minimă este obligatorie"),
  maxAge: z.number().min(1, "Vârsta maximă este obligatorie"),
  isActive: z.boolean(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  weekday: 1,
  startTime: "",
  endTime: "",
  minAge: undefined,
  maxAge: undefined,
  isActive: true,
});

onMounted(() => {
  const groupId = route.params.groupId as string;
  group.value = groupsStore.getGroupById(groupId) || null;

  if (group.value) {
    state.weekday = group.value.weekday;
    state.startTime = formatTime(group.value.startTime);
    state.endTime = formatTime(group.value.endTime);
    state.minAge = Number(group.value.minAge);
    state.maxAge = Number(group.value.maxAge);
    state.isActive = group.value.isActive ?? true;
  } else {
    error("Grupul nu a fost găsit");
    navigateTo("/admin/groups");
  }
});

const handleBack = () => {
  navigateTo("/admin/groups");
};

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const payload = {
      weekday: Number(event.data.weekday),
      startTime: event.data.startTime,
      endTime: event.data.endTime,
      minAge: Number(event.data.minAge),
      maxAge: Number(event.data.maxAge),
      isActive: event.data.isActive,
    };

    await groupsApi.updateGroup(route.params.groupId as string, payload);
    success("Grup actualizat cu succes");
    await navigateTo("/admin/groups");
  } catch (err: any) {
    error(err?.message || "Eroare la actualizarea grupului");
  }
}
</script>
