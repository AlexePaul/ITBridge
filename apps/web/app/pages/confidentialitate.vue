<template>
  <LegalDocument slug="confidentialitate" />
</template>

<script setup lang="ts">
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { pageSeo } from "#shared/seo";
import { breadcrumbNode, schoolGraph, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({
  layout: "default",
  title: "Politica de confidențialitate",
});

const seo = pageSeo("/confidentialitate");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  webPageNode(site, seo),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Politica de confidențialitate", path: "/confidentialitate" },
  ]),
]);
</script>
