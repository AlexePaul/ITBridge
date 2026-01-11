<template>
  <UCard variant="subtle" class="max-w-3xl mx-auto">
    <template #header>
      <h1 class="text-2xl font-bold">Editează Profil</h1>
    </template>

    <div v-if="!profile" class="flex justify-center items-center py-8">
      <UIcon name="i-lucide-loader" class="animate-spin mr-2" />
      <span>Se încarcă...</span>
    </div>

    <UForm v-else :schema="schema" :state="state" class="space-y-5" @submit="handleSubmit">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField name="lastName">
          <template #label>Nume<span class="text-error">*</span></template>
          <UInput v-model="state.lastName" />
        </UFormField>

        <UFormField name="firstName">
          <template #label>Prenume<span class="text-error">*</span></template>
          <UInput v-model="state.firstName" />
        </UFormField>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UFormField name="email">
          <template #label>Email</template>
          <UInput v-model="state.email" type="email" placeholder="user@example.com" />
        </UFormField>

        <UFormField name="phone">
          <template #label>Telefon</template>
          <UInput v-model="state.phone" type="tel" placeholder="+40712345678" />
        </UFormField>
      </div>

      <UFormField name="address">
        <template #label>Adresă</template>
        <UInput v-model="state.address" />
      </UFormField>

      <div class="flex gap-3 pt-2">
        <UButton
          type="submit"
          size="lg"
          class="flex-1 justify-center"
          variant="solid"
          :loading="isSubmitting"
        >
          Salvează Modificări
        </UButton>
        <UButton
          type="button"
          size="lg"
          class="flex-1 justify-center"
          variant="subtle"
          @click="navigateTo(`/admin/profiles/${route.params.profileId}`)"
        >
          Anulează
        </UButton>
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
import { normalizeName } from "~/composables/useUtils";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Editează Profil",
});

const route = useRoute();
const profileApi = useProfileApi();
const { success, error } = useNotifications();

const profile: Ref<Profile | null> = ref(null);
const isSubmitting = ref(false);

const schema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  address: z.string().optional().or(z.literal("")),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  address: "",
});

onMounted(async () => {
  try {
    const fetchedProfiles = await profileApi.fetchProfile(route.params.profileId as string);
    profile.value = fetchedProfiles[0] || null;

    if (profile.value) {
      state.email = profile.value.email || "";
      state.phone = profile.value.phone || "";
      state.firstName = profile.value.firstName || "";
      state.lastName = profile.value.lastName || "";
      state.address = profile.value.address || "";
      console.log("Profile loaded:", profile.value);
    } else {
      error("Profil nu a fost găsit");
      await navigateTo("/admin/profiles");
    }
  } catch (e: any) {
    error(e?.message || "Eroare la încărcarea profilului");
    await navigateTo("/admin/profiles");
  }
});

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  try {
    isSubmitting.value = true;

    const payload = {
      email: event.data.email || undefined,
      phone: event.data.phone || undefined,
      firstName: normalizeName(event.data.firstName),
      lastName: normalizeName(event.data.lastName),
      address: event.data.address || undefined,
    };

    await profileApi.updateProfile(payload, Number(route.params.profileId));
    success("Profil actualizat cu succes");
    await navigateTo(`/admin/profiles/${route.params.profileId}`);
  } catch (e: any) {
    error(e?.message || "Eroare la actualizarea profilului");
  } finally {
    isSubmitting.value = false;
  }
}
</script>
