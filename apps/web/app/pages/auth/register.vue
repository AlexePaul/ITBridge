<script setup lang="ts">
import { ref } from "vue";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import type { RegisterSubmitPayload } from "~/components/AuthPanel.vue";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";

definePageMeta({
  layout: "default",
  title: "Înregistrare",
});

useSeo({
  title: "Înregistrare | IT Bridge School",
  description: "Creează un cont de părinte IT Bridge School.",
  path: "/auth/register",
  noindex: true,
});

const { register } = useAuthApi();
const { success } = useNotifications();

const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function onSubmit(payload: RegisterSubmitPayload) {
  isLoading.value = true;
  errorMessage.value = null;
  try {
    // `remember` is the form's own affair and is not part of the registration.
    const { remember: _remember, ...registration } = payload;
    await register(registration);

    success("Ți-am trimis un email de confirmare", "Contul a fost creat");

    // No longer `/user/profile-setup`: since E11/S2 the profile is written by the registration
    // itself, so that screen has nothing left to ask. The dashboard is where the account's state
    // is explained and where a new confirmation link can be requested.
    await navigateTo("/user/dashboard");
  } catch (error) {
    console.error("Registration failed:", error);
    // The server names which of the three things collided — username, email or phone — and
    // `useApiError` has the Romanian sentence for each. The old blanket message told a parent whose
    // email was already registered to change their username.
    errorMessage.value = apiErrorMessage(
      error,
      "Nu am putut crea contul. Verifică datele și încearcă din nou."
    );
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
    @register="onSubmit"
  />
</template>
