<script setup lang="ts">
import { computed, ref } from "vue";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { apiErrorMessage } from "~/composables/useApiError";

/**
 * „Mi-am uitat parola" — the address, and nothing else.
 *
 * Public by design: a parent who cannot sign in is the entire audience. No username either — a
 * family who has forgotten their password has usually forgotten which of two usernames they chose,
 * and asking for both would turn a recovery form into a quiz.
 *
 * **The screen says the same thing whatever happened.** The server will not tell it whether the
 * address has an account, and the page must not guess: a form that answered „nu există acest cont"
 * would be a way of asking whether a given family is at this school.
 */
definePageMeta({
  layout: "default",
  title: "Resetare parolă",
});

useSeo({
  title: "Resetare parolă | IT Bridge School",
  description: "Cere un link de resetare a parolei contului IT Bridge School.",
  path: "/auth/forgot-password",
  noindex: true,
});

const { forgotPassword } = useAuthApi();

const email = ref("");
const isLoading = ref(false);
const sent = ref(false);
const errorMessage = ref<string | null>(null);

const looksLikeAnAddress = computed(() => /.+@.+\..+/.test(email.value.trim()));

async function onSubmit() {
  errorMessage.value = null;
  if (!looksLikeAnAddress.value) {
    errorMessage.value = "Scrie adresa de email cu care te-ai înregistrat.";
    return;
  }

  isLoading.value = true;
  try {
    await forgotPassword(email.value.trim());
    sent.value = true;
  } catch (error) {
    // Only a network failure or the rate limit reaches here: the route answers 200 for an address
    // it does not know, precisely so that this branch cannot become an oracle.
    errorMessage.value = apiErrorMessage(
      error,
      "Nu am putut trimite linkul acum. Încearcă din nou peste câteva minute."
    );
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <div class="auth-panel">
        <h1 class="auth-title">Ți-ai uitat parola?</h1>

        <template v-if="sent">
          <p class="body-text">
            Dacă adresa <strong>{{ email.trim() }}</strong> are un cont la noi, am trimis acolo un
            link de resetare. Linkul e valabil o oră.
          </p>
          <p class="colophon">
            Nu a ajuns nimic? Verifică și folderul de spam, apoi cere un link nou — sau sună-ne și
            rezolvăm împreună.
          </p>
          <NuxtLink to="/auth/login" class="btn btn-ghost btn-block">
            Înapoi la autentificare
          </NuxtLink>
        </template>

        <template v-else>
          <p class="body-text">
            Scrie adresa de email cu care te-ai înregistrat și îți trimitem un link prin care îți
            alegi o parolă nouă.
          </p>

          <div v-if="errorMessage" class="card card-lg card-accent" role="alert">
            <p class="body-text">{{ errorMessage }}</p>
          </div>

          <form class="form" @submit.prevent="onSubmit">
            <div class="field">
              <label for="forgot-email">Email</label>
              <input
                id="forgot-email"
                v-model="email"
                class="input"
                type="email"
                autocomplete="email"
                placeholder="adresa@exemplu.ro"
              />
            </div>
            <button type="submit" class="btn btn-primary btn-block" :disabled="isLoading">
              {{ isLoading ? "Se trimite…" : "Trimite-mi linkul" }}
            </button>
          </form>

          <hr class="rule" />
          <p class="colophon">
            Ți-ai amintit parola?
            <NuxtLink to="/auth/login" class="link">Autentifică-te</NuxtLink>
          </p>
        </template>
      </div>
    </section>
  </div>
</template>
