<script setup lang="ts">
import { ref } from "vue";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";
import { safeReturnPath } from "~/composables/useReturnPath";
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
const userStore = useUserStore();
const route = useRoute();

const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function onSubmit(payload: { username: string; password: string; remember: boolean }) {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    // „Ține-mă minte" decides how long this browser keeps the session: seven days, or until it closes.
    await login(payload.username, payload.password, payload.remember);

    success("Bine te-am găsit!", "Autentificare reușită");

    // `login` has already read the profile-setup gate — it used to be read here, and the register
    // page, which had no such line, sent every new family past step two.

    // Back where the login interrupted them, if it did: the parent who opened the school's email
    // about their child's work on a device with no session wants that work, not the dashboard.
    const returnPath = safeReturnPath(route.query.inapoi);
    if (returnPath) {
      await navigateTo(returnPath);
      return;
    }

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
