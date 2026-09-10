<template>
  <div class="page">
    <section class="section-lead">
      <div class="setup-panel">
        <span class="kicker">Documente actualizate</span>
        <h1 class="auth-title">Am schimbat termenii</h1>

        <!-- Reachable with nothing to accept, on purpose: an admin, a parent who has just
             confirmed, or anyone who typed the address. The gate does not bounce them off it —
             a page that redirects when it has nothing to say is a page no accessibility run can
             ever measure, because the run signs in as the admin. -->
        <template v-if="documents.length === 0">
          <p class="body-text">
            Nu e nimic de acceptat acum — ai la zi toate documentele. Le poți reciti oricând:
            <NuxtLink to="/termeni" class="link">Termenii și condițiile</NuxtLink> și
            <NuxtLink to="/confidentialitate" class="link">Politica de confidențialitate</NuxtLink>.
          </p>
          <NuxtLink to="/user/dashboard" class="btn btn-primary btn-block"
            >Înapoi în portal</NuxtLink
          >
        </template>

        <template v-else>
          <p class="body-text">
            {{
              documents.length === 1
                ? "A apărut o versiune nouă a documentului de mai jos. Citește-o și confirmă, ca să mergem mai departe."
                : "Au apărut versiuni noi ale documentelor de mai jos. Citește-le și confirmă, ca să mergem mai departe."
            }}
          </p>

          <form class="form setup-form" @submit.prevent="onSubmit">
            <!-- One box per document, never one box for all of them. For the terms that is a
               convention; for the unusual clauses it is Cod civil art. 1203, which says they
               produce no effect unless they are accepted expressly and separately. -->
            <div v-for="document in documents" :key="document" class="field">
              <label class="checkbox checkbox-consent">
                <input v-model="ticked[document]" type="checkbox" />
                <span>
                  Am citit și accept
                  <NuxtLink :to="linkFor(document)" class="link" target="_blank">{{
                    labelFor(document)
                  }}</NuxtLink
                  >.
                </span>
              </label>
            </div>

            <p v-if="submitError" class="field-error">{{ submitError }}</p>

            <button
              type="submit"
              class="btn btn-primary btn-block"
              :disabled="saving || !allTicked"
            >
              {{ saving ? "Se salvează…" : "Confirm" }}
            </button>
          </form>
        </template>

        <!-- §18 promises a way out, so the screen has to show one. Without it this is a page a
             family cannot leave, which is a different thing from a document they can decline. -->
        <p v-if="documents.length > 0" class="colophon">
          Dacă nu ești de acord cu versiunea nouă, poți închide contul din
          <NuxtLink to="/user/profile" class="link">Profil</NuxtLink> — fără niciun cost și fără
          efect asupra cursului copilului. Scrie-ne la
          <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a> dacă vrei să
          vorbim întâi.
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from "vue";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useUserStore } from "~/stores/userStore";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { LEGAL_DOCUMENT_LABELS, LEGAL_DOCUMENT_LINKS } from "~/types/legal.types";
import type { LegalDocumentKey } from "~/types/legal.types";
import { SCHOOL_EMAIL } from "#shared/school";

/**
 * Am schimbat termenii — E22 S4, second half.
 *
 * Terms §18 promises this screen by name: a version that affects a family's rights is announced by
 * email and then asked for at the first sign-in after it. `03.legal-acceptance.global.ts` is what
 * brings the parent here; this page only shows what the server says is outstanding and posts it
 * back. It holds no list of documents of its own — a screen that decided for itself what still
 * needed accepting would be the second copy of a rule, and the copy the ledger does not read.
 */
definePageMeta({
  layout: "portal" as any,
  title: "Am schimbat termenii",
});

const authApi = useAuthApi();
const userStore = useUserStore();
const { success } = useNotifications();

const saving = ref(false);
const submitError = ref<string | null>(null);

// `readonly`, because the store hands its state out that way — and a copy is taken before the
// list is posted, since `readonly` refuses a write and says nothing about it in production.
const documents = computed<readonly LegalDocumentKey[]>(
  () => userStore.user?.pendingLegalDocuments ?? []
);

/**
 * One tick per document, seeded as the list arrives.
 *
 * `watchEffect` rather than a one-off, because the list is empty on the first render: the user is
 * fetched by the boot plugin and this page can be built before it answers.
 */
const ticked = reactive<Partial<Record<LegalDocumentKey, boolean>>>({});
watchEffect(() => {
  for (const document of documents.value) {
    if (ticked[document] === undefined) ticked[document] = false;
  }
});

const allTicked = computed(
  () => documents.value.length > 0 && documents.value.every((document) => ticked[document])
);

const labelFor = (document: LegalDocumentKey) => LEGAL_DOCUMENT_LABELS[document];
const linkFor = (document: LegalDocumentKey) => LEGAL_DOCUMENT_LINKS[document];

async function onSubmit() {
  if (!allTicked.value || saving.value) return;

  saving.value = true;
  submitError.value = null;

  try {
    await authApi.acceptDocuments([...documents.value]);
    success("Îți mulțumim", "Am înregistrat acceptarea.");
    await navigateTo("/user/dashboard");
  } catch (err) {
    submitError.value = apiErrorMessage(err);
  } finally {
    saving.value = false;
  }
}
</script>
