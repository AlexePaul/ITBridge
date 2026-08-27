<script setup lang="ts">
import { ref } from "vue";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useProfileInitialization } from "~/composables/useProfileInitialization";

definePageMeta({
  layout: "default" as any,
  title: "Autentificare",
});

useSeo({
  title: "Autentificare | IT Bridge School",
  description: "Intră în contul de părinte IT Bridge School.",
  path: "/auth/login",
  noindex: true,
});

const { login } = useAuthApi();
const { success } = useNotifications();
const profileInitialization = useProfileInitialization();
const invoiceApi = useInvoiceApi();

const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function onSubmit(payload: { username: string; password: string }) {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    await login(payload.username, payload.password);

    success("Bine te-am găsit!", "Autentificare reușită");

    profileInitialization.initializeProfile();
    invoiceApi.fetchInvoices();

    await navigateTo("/");
  } catch (error) {
    console.error("Login failed:", error);
    errorMessage.value = "Utilizator sau parolă incorectă. Te rugăm să încerci din nou.";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <AuthPanel mode="login" :loading="isLoading" :error-message="errorMessage" @submit="onSubmit" />
</template>
