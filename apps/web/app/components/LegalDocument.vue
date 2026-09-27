<template>
  <div class="page">
    <section class="section-lead">
      <span class="kicker">{{ kicker }}</span>
      <!--
        A version by number (terms §4.7) says which one it is before the text starts: a family who
        followed the link from "Profil" should not read a superseded contract believing it is the one
        in force, nor wonder whether the one in force is what they accepted.
      -->
      <p v-if="version && data" class="body-text legal-version-note">
        <template v-if="data.inForce">
          Aceasta e versiunea {{ data.version }}, cea în vigoare.
        </template>
        <template v-else>
          Aceasta e versiunea {{ data.version }}, înlocuită între timp. O păstrăm aici, neschimbată,
          pentru cine a acceptat-o.
          <NuxtLink :to="`/${slug}`" class="link">Textul în vigoare</NuxtLink>.
        </template>
      </p>
      <!--
        Our own Markdown, rendered on the server from `docs/legal/` with raw HTML switched off;
        nothing in it ever came from a browser, which is the one reason v-html is acceptable here.
      -->
      <article v-if="data" class="legal" v-html="data.html"></article>
      <p v-else class="body-text">
        Nu am putut încărca documentul. Scrie-ne la
        <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a> și ți-l trimitem.
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { SCHOOL_EMAIL } from "#shared/school";
import { LEGAL_DOCUMENTS, type LegalSlug, type RenderedLegalDocument } from "#shared/legal";

const props = defineProps<{
  slug: LegalSlug;
  /** A version by number — `/versiuni/<slug>/<version>`; the text in force when absent. */
  version?: string;
}>();

const kicker = LEGAL_DOCUMENTS[props.slug].kicker;

// `inForce` comes only with a version by number; the page of the document in force needs no flag.
const { data, error } = await useFetch<RenderedLegalDocument & { inForce?: boolean }>(
  props.version ? `/api/legal/${props.slug}/${props.version}` : `/api/legal/${props.slug}`,
  { key: props.version ? `legal-${props.slug}-${props.version}` : `legal-${props.slug}` }
);

// A number nobody published is a page that does not exist, not a document that failed to load:
// the apology below would send the family to the office for a text that was never there.
if (props.version && error.value?.statusCode === 404) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found", fatal: true });
}
</script>

<style scoped>
.legal-version-note {
  max-width: 72ch;
  margin-top: var(--rhythm-2);
  padding-left: 16px;
  border-left: 2px solid var(--color-divider);
}
</style>
