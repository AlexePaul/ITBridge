<template>
  <LegalDocument slug="termeni" />
</template>

<script setup lang="ts">
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { pageSeo } from "#shared/seo";
import { breadcrumbNode, schoolGraph, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({
  layout: "default",
  title: "Termeni și condiții",
});

const seo = pageSeo("/termeni");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  webPageNode(site, seo),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Termeni și condiții", path: "/termeni" },
  ]),
]);
</script>
