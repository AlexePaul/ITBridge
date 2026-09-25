<template>
  <LegalDocument slug="acord-lucrari" />
</template>

<script setup lang="ts">
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { pageSeo } from "#shared/seo";
import { breadcrumbNode, schoolGraph, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

/**
 * The text behind the switch in "Profil" — E07/S2. Public, like the other legal pages, so a family
 * can read what they agreed to, and a family deciding can read it first, without an account.
 */
definePageMeta({
  layout: "default",
  title: "Acordul pentru lucrările copilului",
});

const seo = pageSeo("/acord-lucrari");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  webPageNode(site, seo),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Acordul pentru lucrările copilului", path: "/acord-lucrari" },
  ]),
]);
</script>
