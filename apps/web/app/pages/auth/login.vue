<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useProfileInitialization } from "~/composables/useProfileInitialization";

definePageMeta({
  layout: "default" as any,
});

const badCredentials = ref(false);

const fields: AuthFormField[] = [
  {
    name: "username",
    type: "text",
    label: "utilizator",
    placeholder: "Introdu-ți numele de utilizator",
    required: true,
  },
  {
    name: "password",
    label: "Parolă",
    type: "password",
    placeholder: "Introdu-ți parola",
    required: true,
  },
  {
    name: "remember",
    label: "Ține-mă minte",
    type: "checkbox",
  },
];

const schema = z.object({
  username: z
    .string("Numele de utilizator este obligatoriu")
    .min(1, "Numele de utilizator este obligatoriu"),
  password: z.string("Parola este obligatorie").min(8, "Trebuie să aibă cel puțin 8 caractere"),
});

type Schema = z.output<typeof schema>;

const { login } = useAuthApi();
const { success } = useNotifications();
const isLoading = ref(false);

const profileInitialization = useProfileInitialization();
const invoiceApi = useInvoiceApi();

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  isLoading.value = true;
  try {
    const response = await login(payload.data.username, payload.data.password);

    console.log("Login successful:", response);

    // Show success notification
    success("Bine te-am găsit!", "Autentificare reușită");

    profileInitialization.initializeProfile();
    invoiceApi.fetchInvoices();

    await navigateTo("/");
  } catch (error) {
    console.error("Login failed:", error);
    badCredentials.value = true;
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="mt-20 m-5 p-4 sm:p-8 md:p-10 max-w-3xl w-11/12 border" variant="subtle">
      <template v-if="badCredentials">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          title="Autentificare Eșuată"
          description="Utilizator sau parolă incorectă. Te rugăm să încerci din nou."
        >
        </UAlert>
      </template>

      <UAuthForm
        :schema="schema"
        title="Autentificare"
        description="Introdu-ți acreditările pentru a accesa contul tău."
        icon="i-lucide-user"
        :fields="fields"
        :loading="isLoading"
        @submit="onSubmit"
        class="w-full sm:w-[75%] md:w-[50%] mx-auto"
      />
    </UPageCard>
  </div>
</template>
