<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "#imports";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { useTokenStore } from "~/stores/tokenStore";

/**
 * Where the reset link lands — the second half of „mi-am uitat parola".
 *
 * Unlike `confirm-email.vue`, this one does **not** act on load: confirming an address is the thing
 * the reader already asked for by clicking, while choosing a password needs the password. What the
 * link does on arrival is check that it carries a token at all, so a mangled one says so before the
 * parent types anything.
 *
 * Public, like the confirmation page and for the same reason: the token is the whole credential,
 * and the reader is by definition somebody who cannot sign in.
 */
definePageMeta({
  layout: "default",
  title: "Alege o parolă nouă",
});

useSeo({
  title: "Alege o parolă nouă | IT Bridge School",
  description: "Alege o parolă nouă pentru contul tău IT Bridge School.",
  path: "/auth/reset-password",
  noindex: true,
});

/** Mirrors `MIN_PASSWORD_LENGTH` on the server, which mirrors what registration accepts. */
const MIN_PASSWORD_LENGTH = 6;

const route = useRoute();
const { resetPassword } = useAuthApi();
const tokenStore = useTokenStore();

const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));

const password = ref("");
const confirmation = ref("");
const isLoading = ref(false);
const done = ref(false);
const errorMessage = ref<string | null>(null);

async function onSubmit() {
  errorMessage.value = null;

  if (password.value.length < MIN_PASSWORD_LENGTH) {
    errorMessage.value = `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere.`;
    return;
  }
  // Checked here and nowhere else: the server has only one password to go on, so a mistyped
  // repetition is a thing only this screen can catch — and it is the one that locks a parent out
  // of the account they were in the middle of recovering.
  if (password.value !== confirmation.value) {
    errorMessage.value = "Cele două parole nu sunt identice.";
    return;
  }

  isLoading.value = true;
  try {
    await resetPassword(token.value, password.value);
    // Every session was revoked server-side, this browser's included. Clearing them here is what
    // stops the portal from carrying tokens that have already stopped meaning anything.
    tokenStore.clearTokens();
    done.value = true;
  } catch (error) {
    errorMessage.value = apiErrorMessage(
      error,
      "Nu am putut schimba parola. Cere un link nou și încearcă din nou."
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
        <h1 class="auth-title">Alege o parolă nouă</h1>

        <template v-if="done">
          <p class="body-text">
            Parola a fost schimbată. Te-am deconectat de peste tot, deci autentifică-te din nou cu
            parola pe care tocmai ai ales-o.
          </p>
          <NuxtLink to="/auth/login" class="btn btn-primary btn-block">Autentifică-te</NuxtLink>
        </template>

        <template v-else-if="!token">
          <div class="card card-lg card-accent" role="alert">
            <p class="body-text">
              Linkul nu conține niciun cod de resetare. Deschide-l direct din email, fără să îl
              rescrii.
            </p>
          </div>
          <NuxtLink to="/auth/forgot-password" class="btn btn-ghost btn-block">
            Cere un link nou
          </NuxtLink>
        </template>

        <template v-else>
          <p class="body-text">
            Alege o parolă nouă pentru contul tău. După schimbare te deconectăm de pe toate
            dispozitivele.
          </p>

          <div v-if="errorMessage" class="card card-lg card-accent" role="alert">
            <p class="body-text">{{ errorMessage }}</p>
            <p class="colophon">
              <NuxtLink to="/auth/forgot-password" class="link">Cere un link nou</NuxtLink>
            </p>
          </div>

          <form class="form" @submit.prevent="onSubmit">
            <div class="field">
              <label for="reset-password">Parola nouă</label>
              <input
                id="reset-password"
                v-model="password"
                class="input"
                type="password"
                autocomplete="new-password"
                :placeholder="`Cel puțin ${MIN_PASSWORD_LENGTH} caractere`"
              />
            </div>
            <div class="field">
              <label for="reset-password-confirm">Repetă parola</label>
              <input
                id="reset-password-confirm"
                v-model="confirmation"
                class="input"
                type="password"
                autocomplete="new-password"
                placeholder="Aceeași parolă, încă o dată"
              />
            </div>
            <button type="submit" class="btn btn-primary btn-block" :disabled="isLoading">
              {{ isLoading ? "Se schimbă…" : "Schimbă parola" }}
            </button>
          </form>
        </template>
      </div>
    </section>
  </div>
</template>
