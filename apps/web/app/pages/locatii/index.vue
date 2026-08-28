<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Locații</span>
      <h1 class="page-title">Două săli de curs în București</h1>
      <p class="lede">
        La IT Bridge School se predă în două locații: în Drumul Taberei, Sectorul 6, și în
        Străulești, Sectorul 1. Aceeași programă, aceleași șase niveluri și același preț la
        amândouă. Alegi locația mai apropiată de casă sau de școala copilului.
      </p>
    </section>

    <hr class="rule" />

    <section class="section">
      <div class="cols-2" data-reveal-children>
        <div v-for="location in SCHOOL_LOCATIONS" :key="location.slug" class="card card-lg">
          <h2 class="sub-title">{{ location.neighbourhood }}</h2>
          <p class="body-text">
            {{ location.street }}<br />
            {{ location.district }}, {{ location.postalCode }} {{ location.city }}
          </p>
          <p class="body-text">{{ coverage[location.slug] }}</p>
          <p class="body-text">
            <NuxtLink :to="`/locatii/${location.slug}`" class="link">
              Cum ajungi, program și întrebări frecvente →
            </NuxtLink>
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Nu ești sigur care ți se potrivește?</h2>
      <p class="body-text measure-wide">
        Spune-ne unde stați și la ce oră v-ar conveni. Îți spunem la care dintre cele două locații
        sunt locuri libere în grupa potrivită copilului.
      </p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <NuxtLink to="/contact" class="btn btn-ghost">Scrie-ne</NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useReveal } from "~/composables/useReveal";
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { SCHOOL_LOCATIONS, SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";
import { pageSeo } from "#shared/seo";
import { schoolGraph, breadcrumbNode, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" });

useReveal();

// Written out, not joined from a list: a comma-separated run of neighbourhood
// names is the signature of a page built for a crawler.
const coverage: Record<string, string> = {
  "drumul-taberei":
    "Vin copii din Drumul Taberei, din Militari și din Ghencea, adică din tot vestul orașului.",
  straulesti:
    "Vin copii din Străulești și din Bucureștii Noi, dar și din Chitila și Mogoșoaia, care sunt " +
    "la câteva minute pe șosea.",
};

const seo = pageSeo("/locatii");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  webPageNode(site, seo),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Locații", path: "/locatii" },
  ]),
]);
</script>
