<script setup lang="ts">
import { ref } from "vue";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";

definePageMeta({
  layout: "default" as any,
  title: "Înregistrare",
});

const { register } = useAuthApi();
const { success } = useNotifications();

const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function onSubmit(payload: { username: string; password: string }) {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    await register(payload.username, payload.password);

    success("Bine te-am găsit!", "Înregistrarea a fost reușită");

    await navigateTo("/user/profile-setup");
  } catch (error) {
    console.error("Registration failed:", error);
    errorMessage.value =
      "Un cont cu acest utilizator poate deja exista sau informațiile furnizate sunt invalide. " +
      "Te rugăm să încerci din nou.";
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <AuthPanel
    mode="register"
    :loading="isLoading"
    :error-message="errorMessage"
    @submit="onSubmit"
  />
</template>
