<template>
  <LegalDocument :slug="slug" :version="version" />
</template>

<script setup lang="ts">
import { useSeo } from "~/composables/useSeo";
import { isVersionedSlug, versionPath, type VersionedSlug } from "#shared/legal";
import { pageSeo } from "#shared/seo";

/**
 * One version of a legal text by its number — terms §4.7: the version a family accepted „o poți
 * reciti oricând din portal". "Profil" links here from each accepted version that has since been
 * replaced; the text comes from `docs/legal/versiuni/`, kept complete by `legal-versions.spec.ts`.
 *
 * `noindex` and out of the sitemap: a superseded text is kept for whoever accepted it, and a search
 * engine offering it next to the one in force would be offering the wrong contract.
 */
definePageMeta({
  layout: "default",
});

const route = useRoute();

const documentOr404 = (value: string): VersionedSlug => {
  if (!isVersionedSlug(value)) {
    throw createError({ statusCode: 404, statusMessage: "Page Not Found", fatal: true });
  }
  return value;
};

const slug = documentOr404(String(route.params.doc));
const version = String(route.params.versiune);
if (!/^\d+\.\d+$/.test(version)) {
  throw createError({ statusCode: 404, statusMessage: "Page Not Found", fatal: true });
}

const name = pageSeo(`/${slug}`).title.replace(/ \| IT Bridge School$/, "");
useSeo({
  title: `${name}, versiunea ${version} | IT Bridge School`,
  description: `Versiunea ${version} a documentului „${name}", așa cum a fost publicată.`,
  path: versionPath(slug, version),
  noindex: true,
});
</script>
