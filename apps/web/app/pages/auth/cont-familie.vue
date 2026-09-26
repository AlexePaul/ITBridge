<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "#imports";
import { useSeo } from "~/composables/useSeo";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { claimSchema, MIN_PASSWORD_LENGTH } from "~/composables/useAuthForms";
import { useNotifications } from "~/composables/useNotifications";

/**
 * Where the link to a family the office typed in lands — E11 S2, review of 26 September 2026.
 *
 * The office wrote the family down from a phone call; the family now wants to sign in. The link in
 * the mail proves the address, so this page asks only what an account needs — a username, a
 * password, and the two acceptances registration asks for — and the account is created on the
 * office's row. Like `reset-password.vue` it does not act on load: choosing a password needs the
 * password, and a mail scanner opening the link must not spend it.
 *
 * Public: the reader has no account by definition, and the token is the whole credential.
 */
definePageMeta({
  layout: "default",
  title: "Termină-ți contul",
});

useSeo({
  title: "Termină-ți contul | IT Bridge School",
  description: "Alege un nume de utilizator și o parolă pentru contul familiei tale.",
  path: "/auth/cont-familie",
  noindex: true,
});

const route = useRoute();
const { claimAccount } = useAuthApi();
const { success } = useNotifications();

const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));

type FieldName = "username" | "password" | "acceptedTerms" | "acceptedUnusualClauses";

const form = reactive({
  username: "",
  password: "",
  acceptedTerms: false,
  acceptedUnusualClauses: false,
});
const errors = reactive<Partial<Record<FieldName, string>>>({});
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

// A message goes when its field changes, as on the register form.
watch(
  () => ({ ...form }),
  (now, before) => {
    for (const key of Object.keys(errors) as FieldName[]) {
      if (now[key] !== before[key]) errors[key] = undefined;
    }
  }
);

async function onSubmit() {
  errorMessage.value = null;
  for (const key of Object.keys(errors) as FieldName[]) errors[key] = undefined;

  const result = claimSchema.safeParse(form);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as FieldName;
      errors[field] ??= issue.message;
    }
    return;
  }

  isLoading.value = true;
  try {
    await claimAccount({ token: token.value, ...result.data });
    success("Contul a fost creat", "Mai rămâne aprobarea școlii");
    // What `register.vue` does after success: into the portal, where the profile-setup gate asks for
    // whatever the office did not write down, and the dashboard says the approval is pending.
    await navigateTo("/user/dashboard");
  } catch (error) {
    errorMessage.value = apiErrorMessage(
      error,
      "Nu am putut crea contul. Încearcă din nou sau cere un link nou."
    );
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="page">
    <section class="section-lead">
      <div class="auth-panel">
        <h1 class="auth-title">Termină-ți contul</h1>

        <template v-if="!token">
          <div class="card card-lg card-accent" role="alert">
            <p class="body-text">
              Linkul nu conține niciun cod. Deschide-l direct din email, fără să îl rescrii.
            </p>
          </div>
          <NuxtLink to="/auth/register" class="btn btn-ghost btn-block">
            Încearcă din nou înregistrarea
          </NuxtLink>
        </template>

        <template v-else>
          <p class="body-text">
            Familia ta este deja în evidența școlii. Alege un nume de utilizator și o parolă, iar
            contul se leagă de datele pe care le avem. Adresa de email e confirmată prin linkul pe
            care l-ai deschis; contul îl mai aprobăm și noi.
          </p>

          <div v-if="errorMessage" class="card card-lg card-accent" role="alert">
            <p class="body-text">{{ errorMessage }}</p>
            <p class="colophon">
              <NuxtLink to="/auth/register" class="link">
                Cere un link nou, înregistrându-te din nou cu aceeași adresă
              </NuxtLink>
            </p>
          </div>

          <form class="form" novalidate @submit.prevent="onSubmit">
            <div class="field">
              <label for="claim-username">Utilizator</label>
              <input
                id="claim-username"
                v-model="form.username"
                class="input"
                type="text"
                autocomplete="username"
                placeholder="Numele tău de utilizator"
              />
              <p v-if="errors.username" class="field-error">{{ errors.username }}</p>
            </div>
            <div class="field">
              <label for="claim-password">Parolă</label>
              <input
                id="claim-password"
                v-model="form.password"
                class="input"
                type="password"
                autocomplete="new-password"
                :placeholder="`Cel puțin ${MIN_PASSWORD_LENGTH} caractere`"
              />
              <p v-if="errors.password" class="field-error">{{ errors.password }}</p>
            </div>

            <!-- The same two checkboxes as the register form, for the same reasons: the account is
                 the contract the terms describe, and Cod civil art. 1203 wants the unusual clauses
                 accepted expressly and separately. -->
            <div class="field">
              <label class="checkbox checkbox-consent">
                <input v-model="form.acceptedTerms" type="checkbox" />
                <span>
                  Am citit
                  <NuxtLink to="/termeni" class="link" target="_blank"
                    >Termenii și condițiile</NuxtLink
                  >
                  și
                  <NuxtLink to="/confidentialitate" class="link" target="_blank">
                    Politica de confidențialitate
                  </NuxtLink>
                  și sunt de acord cu ele.
                </span>
              </label>
              <p v-if="errors.acceptedTerms" class="field-error">{{ errors.acceptedTerms }}</p>
            </div>
            <div class="field">
              <label class="checkbox checkbox-consent">
                <input v-model="form.acceptedUnusualClauses" type="checkbox" />
                <span>
                  Accept în mod expres clauzele din
                  <NuxtLink to="/termeni#14-reguli-de-utilizare" class="link" target="_blank"
                    >§14 (suspendarea contului)</NuxtLink
                  >,
                  <NuxtLink
                    to="/termeni#15-disponibilitate-erori-raspundere"
                    class="link"
                    target="_blank"
                    >§15 (limitarea răspunderii)</NuxtLink
                  >
                  și
                  <NuxtLink to="/termeni#18-modificarea-termenilor" class="link" target="_blank"
                    >§18 (modificarea termenilor)</NuxtLink
                  >.
                </span>
              </label>
              <p v-if="errors.acceptedUnusualClauses" class="field-error">
                {{ errors.acceptedUnusualClauses }}
              </p>
            </div>

            <button type="submit" class="btn btn-primary btn-block" :disabled="isLoading">
              {{ isLoading ? "Se creează…" : "Creează contul" }}
            </button>
          </form>
        </template>
      </div>
    </section>
  </div>
</template>
