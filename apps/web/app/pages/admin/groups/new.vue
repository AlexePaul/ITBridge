<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Adaugă Grup Nou</h1>
        <p class="text-muted mt-1">Completează detaliile pentru a crea un nou grup</p>
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

        <!-- Actions -->
        <div class="flex gap-3 pt-6 border-t border-muted justify-center">
          <UButton type="submit" color="primary" variant="subtle" size="md" class="w-40">
            Creează Grup
          </UButton>
          <UButton color="primary" variant="outline" size="md" class="w-40" @click="handleBack">
            Anulare
          </UButton>
        </div>
      </UForm>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useNotifications } from "~/composables/useNotifications";
import { useGroupsApi } from "~/composables/api/useGroupsApi";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Adaugă Grup Nou",
});

const { success } = useNotifications();

const days = [
  { label: "Luni", id: 1 },
  { label: "Marti", id: 2 },
  { label: "Miercuri", id: 3 },
  { label: "Joi", id: 4 },
  { label: "Vineri", id: 5 },
  { label: "Sambata", id: 6 },
];
const groupsApi = useGroupsApi();

const schema = z.object({
  weekday: z.number().min(1, "Ziua săptămânii este obligatorie"),
  startTime: z.string().min(1, "Ora de începent este obligatorie"),
  endTime: z.string().min(1, "Ora de sfârșit este obligatorie"),
  minAge: z.number().min(1, "Vârsta minimă este obligatorie"),
  maxAge: z.number().min(1, "Vârsta maximă este obligatorie"),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  weekday: 1,
  startTime: "",
  endTime: "",
  minAge: undefined,
  maxAge: undefined,
});

const handleBack = () => {
  navigateTo("/admin/groups");
};

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const payload = {
      weekday: event.data.weekday,
      startTime: event.data.startTime,
      endTime: event.data.endTime,
      minAge: event.data.minAge,
      maxAge: event.data.maxAge,
    };

    await groupsApi.createGroup(payload);
    success("Grup creat cu succes");
    await navigateTo("/admin/groups");
  } catch (err: any) {
    console.error(err?.message || "Eroare la crearea grupului");
  }
}
</script>
