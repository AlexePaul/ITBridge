<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Mesaje despre noutăți</span>

      <template v-if="done">
        <h1 class="page-title">Gata, nu îți mai scriem</h1>
        <p class="lede">
          Nu vei mai primi mesaje despre noutăți, tabere sau cursuri noi. Facturile, anunțurile
          despre ore și lucrările copilului vin în continuare — pe acelea nu le-ai oprit și nu se
          pot opri de aici.
        </p>
        <p class="body-text">
          Dacă te răzgândești, poți porni mesajele la loc din
          <NuxtLink to="/user/profile" class="link">Profil</NuxtLink>, când ești autentificat.
        </p>
      </template>

      <template v-else-if="!token">
        <h1 class="page-title">Link incomplet</h1>
        <p class="lede">
          Linkul pe care l-ai deschis nu conține codul de care avem nevoie — se întâmplă când un
          program de e-mail îl taie în două. Deschide-l din nou din mesaj, sau scrie-ne la
          <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a> și te scoatem noi
          de pe listă.
        </p>
      </template>

      <template v-else>
        <h1 class="page-title">Nu mai vrei mesaje despre noutăți?</h1>
        <p class="lede">
          Apasă butonul și nu îți mai trimitem. Facturile, anunțurile despre ore anulate și
          lucrările copilului rămân neatinse — pe acelea le primești fiindcă îți sunt datorate, nu
          fiindcă ai fost de acord cu reclame.
        </p>

        <!--
          A button, not something the page does on load — E17/S4.

          The link arrives in an e-mail, and mail clients, security scanners and preview bots fetch
          links without anybody clicking. A page that unsubscribed on sight would quietly opt out
          families who never refused, and the evidence would look exactly like people refusing.
        -->
        <button type="button" class="btn btn-primary" :disabled="saving" @click="confirm">
          {{ saving ? "Se salvează…" : "Da, oprește-le" }}
        </button>

        <p v-if="failed" class="field-error" role="alert">
          Nu am reușit să salvăm. Încearcă din nou, sau scrie-ne la
          <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a
          >.
        </p>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useSeo } from "~/composables/useSeo";
import { useMarketingApi } from "~/composables/api/useMarketingApi";
import { SCHOOL_EMAIL } from "#shared/school";

/**
 * Dezabonare — E17/S4.
 *
 * Legea 506/2004 art. 12 asks that a promotional message let the reader refuse from inside it, and
 * GDPR art. 7 alin. 3 that refusing be no harder than agreeing. The toggle in the portal is behind
 * a login, on a device that is often not the one the e-mail was opened on, so this page exists to
 * be reachable with nothing but the link.
 *
 * **Not in `PUBLIC_PAGES`, and `noindex`.** It is not a page anybody searches for, it says nothing
 * without a token, and a crawler that indexed it would be indexing somebody's unsubscribe link.
 * That also keeps it out of the sitemap the three CI gates read, which is right: they visit pages a
 * visitor could arrive at, and this is one you arrive at from your own inbox.
 *
 * **It touches the backend**, which makes it the second exception to "the public site works without
 * an API", after `/proba` — and it carries the same consequence: there is no point bringing it to
 * `release/prod` until a backend runs there. It cannot fail softly the way `/proba` does, because
 * the whole page *is* the write; what it does instead is say so and give the office's address.
 */
definePageMeta({ layout: "default" as any });

useSeo({
  title: "Dezabonare — IT Bridge School",
  description: "Oprește mesajele despre noutăți de la IT Bridge School.",
  path: "/dezabonare",
  noindex: true,
});

const route = useRoute();
const marketingApi = useMarketingApi();

/** The token as it arrived. A repeated `?token=` in a mangled link yields an array; take the first. */
const token = computed(() => {
  const raw = route.query.token;
  return (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
});

const saving = ref(false);
const failed = ref(false);
const done = ref(false);

async function confirm() {
  if (!token.value || saving.value) return;
  saving.value = true;
  failed.value = false;
  try {
    await marketingApi.unsubscribe(token.value);
    done.value = true;
  } catch {
    // No detail on screen: the server does not say whether the token was real, so there is nothing
    // truthful to report beyond "it did not go through, here is who to ask".
    failed.value = true;
  } finally {
    saving.value = false;
  }
}
</script>
