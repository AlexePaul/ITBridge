<template>
  <UCard variant="subtle" class="border max-w-3xl mx-auto">
    <template #header>
      <h1 class="text-2xl font-bold">Adaugă Profil Nou</h1>
    </template>

    <UForm :schema="schema" :state="state" class="space-y-5" @submit="handleSubmit">
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

      <UFormField name="userId" class="w-full">
        <template #label>Asociază utilizator (opțional)</template>
        <USelectMenu
          v-model="state.userId"
          :items="userOptions"
          value-key="id"
          searchable
          placeholder="Fără utilizator"
          class="w-full"
        />
      </UFormField>

      <UFormField name="address">
        <template #label>Adresă</template>
        <UInput v-model="state.address" />
      </UFormField>

      <div class="flex gap-3 pt-2">
        <UButton type="submit" size="lg" class="flex-1 justify-center" variant="solid">
          Creează Profil
        </UButton>
        <UButton
          type="button"
          size="lg"
          class="flex-1 justify-center"
          variant="subtle"
          @click="navigateTo('/admin/profiles')"
        >
          Anulează
        </UButton>
      </div>
    </UForm>
  </UCard>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, SelectMenuItem } from "@nuxt/ui";
import { useUserApi } from "~/composables/api/useUserApi";
import { useProfileApi } from "~/composables/api/useProfileApi";
import type { User } from "~/types/user.types";
import type { Profile } from "~/types/profile.types";
import { useNotifications } from "~/composables/useNotifications";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Adaugă Profil Nou",
});

const userApi = useUserApi();
const profileApi = useProfileApi();
const { success, error } = useNotifications();

const usersWithoutProfile: Ref<User[]> = ref([]);
const userOptions: Ref<SelectMenuItem[]> = ref([{ label: "Fără utilizator", value: null }]);

onMounted(async () => {
  try {
    const fetchedUsers = await userApi.fetchUsersWithoutProfile();
    console.log("Fetched users raw:", fetchedUsers);
    console.log("Fetched users length:", fetchedUsers?.length);

    usersWithoutProfile.value = fetchedUsers;
    console.log("Users without profile ref:", usersWithoutProfile.value);
    console.log("Users without profile ref length:", usersWithoutProfile.value.length);

    const mappedOptions = usersWithoutProfile.value.map((u: any) => {
      console.log("Mapping user:", u);
      return {
        id: Number(u.id),
        label: `${u.username} (#${u.id})`,
      };
    });
    console.log("Mapped options:", mappedOptions);

    userOptions.value = [{ id: null, label: "Fără utilizator" }, ...mappedOptions];
    console.log("Final userOptions:", userOptions.value);
  } catch (e: any) {
    console.error("Error fetching users:", e);
    error(e?.message || "Nu am putut încărca utilizatorii fără profil");
  }
});

const schema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  address: z.string().optional().or(z.literal("")),
  userId: z.number().nullable().optional(),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  email: "",
  phone: "",
  firstName: "",
  lastName: "",
  address: "",
  userId: null,
});

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const payload: Partial<Profile> & { userId?: number } = {
      email: event.data.email || undefined,
      phone: event.data.phone || undefined,
      firstName: event.data.firstName,
      lastName: event.data.lastName,
      address: event.data.address || undefined,
      userId: event.data.userId ?? undefined,
    } as any;

    const created = await profileApi.createProfile(payload);
    if (created) {
      success("Profil creat cu succes");
      await navigateTo("/admin/profiles");
    }
  } catch (e: any) {
    error(e?.message || "Eroare la crearea profilului");
  }
}
</script>
