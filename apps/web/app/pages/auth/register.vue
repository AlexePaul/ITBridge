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

    // Towards the portal, and the profile-setup gate turns it into step two: `register` has read
    // the gate by now, and a family that has just signed up has no phone, address or emergency
    // contact yet, so `02.profile-setup.global` sends them to `/user/profile-setup` — the step that
    // cannot be skipped. The comment here used to say that screen had nothing left to ask, from
    // the months when registration took every field, and the page was written to match it.
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
