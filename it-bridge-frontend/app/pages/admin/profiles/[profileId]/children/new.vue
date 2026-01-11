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
        <UInputDate ref="inputDate" v-model="state.birthDate">
          <template #trailing>
            <UPopover :reference="inputDate?.inputsRef?.[3]?.$el">
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-calendar"
                aria-label="Select a date"
                class="px-0"
              />

              <template #content>
                <UCalendar v-model="state.birthDate" class="p-2" />
              </template>
            </UPopover>
          </template>
        </UInputDate>
      </UFormField>

      <div class="flex gap-3 pt-2">
        <UButton type="submit" size="lg" class="flex-1 justify-center" variant="solid"
          >Adaugă Copil</UButton
        >
        <UButton
          type="button"
          variant="subtle"
          size="lg"
          class="flex-1 justify-center"
          @click="handleCancel"
          >Anulează</UButton
        >
      </div>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useProfileApi } from "~/composables/api/useProfileApi";
import type { Profile } from "~/types/profile.types";
import { useNotifications } from "~/composables/useNotifications";
import { getLocalTimeZone, today } from "@internationalized/date";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { normalizeName } from "~/composables/useUtils";

const route = useRoute();
const { success, error } = useNotifications();
const inputDate = ref();
const childrenApi = useChildrenApi();

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Adaugă Copil",
});

const schema = z.object({
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  birthDate: z.any(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  firstName: "",
  lastName: "",
  birthDate: undefined,
});

const displayFormatter = (value: any) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en-GB").format(date); // dd/mm/yyyy
};

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const birthDate = event.data.birthDate;
    const formattedDate =
      birthDate instanceof Date ? birthDate.toISOString().split("T")[0] : birthDate?.toString?.();

    const childData = {
      firstName: normalizeName(event.data.firstName),
      lastName: normalizeName(event.data.lastName),
      birthDate: formattedDate,
      parentId: parseInt(route.params.profileId as string),
    };

    await childrenApi.createChild(childData);

    success("Copilul a fost adăugat cu succes!");
    await navigateTo(`/admin/profiles/${route.params.profileId}`);
  } catch (err: any) {
    error(err.message || "Eroare la adăugarea copilului");
  }
}

function handleCancel() {
  navigateTo(`/admin/profiles/${route.params.profileId}`);
}
</script>
