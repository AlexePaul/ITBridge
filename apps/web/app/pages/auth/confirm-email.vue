<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "#imports";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { useUserStore } from "~/stores/userStore";
import { useTokenStore } from "~/stores/tokenStore";

/**
 * Where the link in the confirmation email lands — E11/S2, the first gate.
 *
 * The page confirms on load rather than behind a button. The reader already acted, by clicking the
 * link in their mail; asking them to click a second time to do the thing they asked for is a step
 * that exists only because it was easier to build.
 *
 * No auth middleware: this is a public page by design. A parent commonly opens the link on a phone
 * that has never signed in, and a gate that required the account it unlocks would be a circle.
 */
definePageMeta({
  layout: "default",
  title: "Confirmare email",
});

useSeo({
  title: "Confirmare email | IT Bridge School",
  description: "Confirmă adresa de email a contului tău IT Bridge School.",
  path: "/auth/confirm-email",
  noindex: true,
});

const route = useRoute();
const { confirmEmail } = useAuthApi();
const tokenStore = useTokenStore();

type State = "working" | "confirmed" | "awaiting-approval" | "failed";

const state = ref<State>("working");
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  const token = route.query.token;
  if (typeof token !== "string" || token.length === 0) {
    state.value = "failed";
    errorMessage.value =
      "Linkul nu conține niciun cod de confirmare. Deschide-l direct din email, fără să îl rescrii.";
    return;
  }

  try {
    const result = await confirmEmail(token);
    // Confirmed is not the same as usable: the admin's approval is a separate gate, and saying
    // "gata, intră în cont" to somebody who then cannot get in would be a worse kind of wrong.
    state.value = result.active ? "confirmed" : "awaiting-approval";

    // A parent who confirmed in the same browser they registered in is still signed in; refreshing
    // the cached user is what makes the portal stop showing "confirmă-ți adresa".
    if (tokenStore.accessToken) {
      await useUserStore()
        .fetchUser()
        .catch(() => undefined);
    }
  } catch (error) {
    state.value = "failed";
    errorMessage.value = apiErrorMessage(
      error,
      "Nu am putut confirma adresa. Încearcă din nou sau scrie-ne."
    );
  }
});
</script>

<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <div class="auth-panel">
        <h1 class="auth-title">Confirmarea adresei de email</h1>

        <p v-if="state === 'working'" class="body-text">Verificăm linkul…</p>

        <template v-else-if="state === 'confirmed'">
          <p class="body-text">
            Adresa ta este confirmată și contul este activ. Te poți autentifica.
          </p>
          <NuxtLink to="/auth/login" class="btn btn-primary btn-block">Autentifică-te</NuxtLink>
        </template>

        <template v-else-if="state === 'awaiting-approval'">
          <p class="body-text">
            Adresa ta este confirmată. Mai rămâne un pas: contul trebuie aprobat de noi. Îți
            trimitem un email imediat ce e gata — de obicei în aceeași zi lucrătoare.
          </p>
          <NuxtLink to="/" class="btn btn-ghost btn-block">Înapoi la pagina principală</NuxtLink>
        </template>

        <template v-else>
          <div class="card card-lg card-accent" role="alert">
            <p class="body-text">{{ errorMessage }}</p>
          </div>
          <p class="colophon">
            Dacă linkul a expirat, autentifică-te și cere unul nou din contul tău.
          </p>
          <NuxtLink to="/auth/login" class="btn btn-ghost btn-block">Autentifică-te</NuxtLink>
        </template>
      </div>
    </section>
  </div>
</template>
