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

const profileApi = useProfileApi();

definePageMeta({
  layout: "default" as any,
});

const schema = z.object({
  email: z.string().email("Adresa de email nu este validă"),
  phone: z.string().max(10).min(10, "Numărul de telefon trebuie să aiba exact 10 cifre"),
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
  const profile: Partial<Profile> = {
    email: event.data.email,
    phone: event.data.phone,
    firstName: event.data.firstName,
    lastName: event.data.lastName,
    address: event.data.address,
  };
  profileApi.createProfile(profile);
  await navigateTo("/");
}
</script>
