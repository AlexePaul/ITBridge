<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "#imports";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { apiErrorCode, apiErrorMessage } from "~/composables/useApiError";
import { useUserStore } from "~/stores/userStore";
import { useTokenStore } from "~/stores/tokenStore";
import {
  confirmationOutcome,
  confirmationRefusal,
  type ConfirmationOutcome,
  type ConfirmationRefusal,
} from "~/composables/useConfirmationOutcome";
import { SCHOOL_EMAIL, SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

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

type State = "working" | ConfirmationOutcome | ConfirmationRefusal;

const state = ref<State>("working");
const errorMessage = ref<string | null>(null);

/**
 * Where the reader goes next. A parent who opens the link in the browser they are signed in to is
 * sent to their account, not to the sign-in form — "Autentifică-te" to somebody already signed in
 * read like a session lost (QA of 27 September 2026). The auth plugin has run before this page
 * mounts, so the user store already says which.
 */
const userStore = useUserStore();
const signedIn = computed(() => Boolean(userStore.user));
const nextStep = computed(() =>
  signedIn.value
    ? { to: "/user/dashboard", label: "Mergi la contul tău" }
    : { to: "/auth/login", label: "Autentifică-te" }
);

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
    state.value = confirmationOutcome(result);

    // A parent who confirmed in the same browser they registered in is still signed in; refreshing
    // the cached user is what makes the portal stop showing "confirmă-ți adresa".
    if (tokenStore.accessToken) {
      await userStore.fetchUser().catch(() => undefined);
    }
  } catch (error) {
    // A used link and an expired one each have their own screen below; everything else says the
    // server's sentence (QA of 27 September 2026).
    state.value = confirmationRefusal(apiErrorCode(error));
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
            Adresa ta este confirmată și contul este activ.{{
              signedIn ? "" : " Te poți autentifica."
            }}
          </p>
          <NuxtLink :to="nextStep.to" class="btn btn-primary btn-block">{{
            nextStep.label
          }}</NuxtLink>
        </template>

        <template v-else-if="state === 'awaiting-approval'">
          <p class="body-text">
            Adresa ta este confirmată. Mai rămâne un pas: contul trebuie aprobat de noi. Îți
            trimitem un email imediat ce e gata — de obicei în aceeași zi lucrătoare.
          </p>
          <NuxtLink to="/" class="btn btn-ghost btn-block">Înapoi la pagina principală</NuxtLink>
        </template>

        <!-- The school has already said no (review of 26 September 2026): the address is confirmed
             all the same, and the way on is the one the refusal mail names — not a wait. -->
        <template v-else-if="state === 'rejected'">
          <p class="body-text">
            Adresa ta este confirmată, dar contul nu a fost activat — ți-am scris despre asta pe
            email. Dacă ți se pare o greșeală, scrie-ne la
            <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a> sau sună-ne la
            <a :href="SCHOOL_PHONE_HREF" class="link">{{ SCHOOL_PHONE }}</a> și ne uităm încă o
            dată.
          </p>
          <NuxtLink to="/" class="btn btn-ghost btn-block">Înapoi la pagina principală</NuxtLink>
        </template>

        <!-- A second use of the link: the address is confirmed, and what is left is on the account,
             which the refusal does not describe (QA of 27 September 2026). -->
        <template v-else-if="state === 'used'">
          <div class="card card-lg" role="status">
            <p v-if="signedIn" class="body-text">
              Linkul a fost deja folosit, iar adresa ta este confirmată. Pe pagina Acasă a contului
              scrie dacă mai așteptăm aprobarea școlii sau dacă totul e gata.
            </p>
            <p v-else class="body-text">
              Linkul a fost deja folosit, iar adresa ta este confirmată. Autentifică-te ca să vezi
              ce mai rămâne: pe pagina Acasă a contului scrie dacă mai așteptăm aprobarea școlii sau
              dacă totul e gata.
            </p>
          </div>
          <NuxtLink :to="nextStep.to" class="btn btn-primary btn-block">{{
            nextStep.label
          }}</NuxtLink>
        </template>

        <template v-else-if="state === 'expired'">
          <div class="card card-lg card-accent" role="alert">
            <p class="body-text">{{ errorMessage }}</p>
          </div>
          <p class="colophon">
            {{ signedIn ? "Butonul" : "După autentificare, butonul" }} „Retrimite linkul" e pe
            pagina Acasă a contului.
          </p>
          <NuxtLink :to="nextStep.to" class="btn btn-ghost btn-block">{{
            nextStep.label
          }}</NuxtLink>
        </template>

        <template v-else>
          <div class="card card-lg card-accent" role="alert">
            <p class="body-text">{{ errorMessage }}</p>
          </div>
          <NuxtLink :to="nextStep.to" class="btn btn-ghost btn-block">{{
            nextStep.label
          }}</NuxtLink>
        </template>
      </div>
    </section>
  </div>
</template>
