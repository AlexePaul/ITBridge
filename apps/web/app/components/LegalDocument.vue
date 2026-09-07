<template>
  <div class="page">
    <section class="section-lead">
      <span class="kicker">{{ kicker }}</span>
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

const props = defineProps<{ slug: LegalSlug }>();

const kicker = LEGAL_DOCUMENTS[props.slug].kicker;

const { data } = await useFetch<RenderedLegalDocument>(`/api/legal/${props.slug}`, {
  key: `legal-${props.slug}`,
});
</script>
