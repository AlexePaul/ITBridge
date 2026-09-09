<script setup lang="ts">
import { ref } from "vue";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { useProfileInitialization } from "~/composables/useProfileInitialization";

definePageMeta({
  layout: "default",
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

const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function onSubmit(payload: { username: string; password: string }) {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    await login(payload.username, payload.password);

    success("Bine te-am găsit!", "Autentificare reușită");

    // Awaited, because the middleware that follows reads what it sets. `initializeProfile` fetches
    // the profile before assigning `ProfileSetup`, so unawaited the flag is still `false` when
    // `navigateTo` runs its guards — and a family that has not finished step two lands on the
    // dashboard instead of the form, then gets bounced on their next click. It swallows its own
    // failures, so awaiting cannot make the login fail.
    await profileInitialization.initializeProfile();

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
  <AuthPanel mode="login" :loading="isLoading" :error-message="errorMessage" @login="onSubmit" />
</template>
