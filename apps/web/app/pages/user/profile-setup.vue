<template>
  <h1 class="text-4xl font-bold text-center mt-12 mb-6">Completează Profilul</h1>
  <UCard variant="subtle" class="max-w-[90%] md:max-w-2xl mt-4 mx-auto p-6 border rounded-lg">
    <UForm :schema="schema" :state="state" class="space-y-4 w-full" @submit="handleSubmit">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        <UFormField name="lastName">
          <template #label>Nume<span class="text-error">*</span></template>
          <UInput v-model="state.lastName" />
        </UFormField>

        <UFormField name="firstName">
          <template #label>Prenume<span class="text-error">*</span></template>
          <UInput v-model="state.firstName" />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        <UFormField name="email">
          <template #label>Email<span class="text-error">*</span></template>
          <UInput v-model="state.email" type="email" />
        </UFormField>

        <UFormField name="phone">
          <template #label>Număr de telefon<span class="text-error">*</span></template>
          <UInput v-model="state.phone" type="tel" />
        </UFormField>
      </div>

      <UFormField label="Adresă" name="address" class="w-full">
        <UInput v-model="state.address" :rows="3" />
      </UFormField>
      <UButton type="submit" class="mx-auto block"> Submit </UButton>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useProfileApi } from "~/composables/api/useProfileApi";
import type { Profile } from "~/types/profile.types";
import { useProfileStore } from "~/stores/profileStore";
import { useNotifications } from "~/composables/useNotifications";
import { isRomanianPhone, normalizePhone } from "~/composables/useUtils";
import { apiErrorCode, apiErrorMessage } from "~/composables/useApiError";

const profileApi = useProfileApi();
const { error } = useNotifications();

definePageMeta({
  layout: "dashboard" as any,
  title: "Completează Profilul",
});

const schema = z.object({
  email: z.string().email("Adresa de email nu este validă"),
  // Was `exactly 10 characters`, which accepted only `0712345678` — while the API demanded
  // international format, so no value satisfied both and this form could never be submitted.
  // Both spellings are valid now, on either side.
  phone: z
    .string()
    .min(1, "Numărul de telefon este obligatoriu")
    .refine(isRomanianPhone, "Număr de telefon invalid (ex. 0712345678)"),
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  address: z.string().optional(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  address: "",
});

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  const address = event.data.address?.trim();
  const profile: Partial<Profile> = {
    email: event.data.email,
    phone: normalizePhone(event.data.phone),
    firstName: event.data.firstName,
    lastName: event.data.lastName,
    // Omit rather than send `""`. An untouched input submits an empty string, which is not an
    // address; sending it made the request fail validation on a field the parent left blank.
    ...(address ? { address } : {}),
  };

  // `createProfile` throws now. It used to return the status code, so a rejected request looked
  // like a success here: we navigated away, the setup flag stayed set, and the middleware sent the
  // parent straight back to this form with nothing shown.
  try {
    await profileApi.createProfile(profile);
    await navigateTo("/user/profile");
  } catch (err) {
    if (apiErrorCode(err) === "ALREADY_EXISTS" || apiErrorCode(err) === "CONFLICT") {
      error("Email-ul sau numărul de telefon există deja în sistem.");
      return;
    }
    error(apiErrorMessage(err, "Nu am putut salva profilul. Încearcă din nou."));
  }
}
</script>
