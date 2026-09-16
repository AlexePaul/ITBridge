<script setup lang="ts">
import { ref } from "vue";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { useProfileInitialization } from "~/composables/useProfileInitialization";
import { useUserStore } from "~/stores/userStore";

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
const userStore = useUserStore();

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

    // Into the portal, not onto the public home page. The guards this comment relies on are
    // `01.auth.global` and `02.profile-setup.global`, and both return early on a route that is not
    // protected — `protectedPrefixes` is `/admin` and `/user`. So `navigateTo("/")` was the one
    // destination where neither could run: the family arrived logged in, cookies set, looking at
    // the visitor site, and the form step two exists to force was never reached. Registration has
    // always landed in the portal; this is login catching up.
    await navigateTo(userStore.user?.role === "ADMIN" ? "/admin/dashboard" : "/user/dashboard");
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
