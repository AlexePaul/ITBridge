<template>
  <UCard variant="subtle" class="max-w-2xl mx-auto">
    <template #header>
      <h1 class="text-2xl font-bold">Adaugă Copil</h1>
    </template>

    <UForm :schema="schema" :state="state" class="space-y-5 w-full" @submit="handleSubmit">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField name="firstName">
          <template #label>Prenume<span class="text-error">*</span></template>
          <UInput v-model="state.firstName" placeholder="ex. John" />
        </UFormField>

        <UFormField name="lastName">
          <template #label>Nume<span class="text-error">*</span></template>
          <UInput v-model="state.lastName" placeholder="ex. Doe" />
        </UFormField>
      </div>

      <UFormField name="birthDate">
        <template #label>Data Nașterii<span class="text-error">*</span></template>
        <AdminDateField v-model="state.birthDate" :max="today" />
      </UFormField>

      <AdminFormActions submit-label="Adaugă copil" :cancel-to="profileUrl" :loading="saving" />
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useNotifications } from "~/composables/useNotifications";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { normalizeName } from "~/composables/useUtils";
import { apiErrorMessage } from "~/composables/useApiError";
import { DATE_KEY_PATTERN } from "~/composables/useDateField";
import { todayKey } from "~/composables/useAttendanceCalendar";

const route = useRoute();
const { success, error } = useNotifications();
const childrenApi = useChildrenApi();

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Adaugă Copil",
});

const profileUrl = `/admin/profiles/${route.params.profileId}`;
/** Nobody enrols a child who is not born yet; the calendar stops at today. */
const today = todayKey();
const saving = ref(false);

const schema = z.object({
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  birthDate: z
    .string({ error: "Data nașterii este obligatorie" })
    .regex(DATE_KEY_PATTERN, "Data nașterii este obligatorie"),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  firstName: "",
  lastName: "",
  birthDate: undefined,
});

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  saving.value = true;
  try {
    const payload = {
      firstName: normalizeName(event.data.firstName),
      lastName: normalizeName(event.data.lastName),
      // Already the `YYYY-MM-DD` the API takes — `AdminDateField` keeps it that way.
      birthDate: event.data.birthDate,
      parentId: Number(route.params.profileId),
    };
    await childrenApi.createChild(payload);
    success("Copilul a fost adăugat cu succes!");
    await navigateTo(profileUrl);
  } catch (err) {
    error("Copilul nu s-a putut adăuga", apiErrorMessage(err));
  } finally {
    saving.value = false;
  }
}
</script>
