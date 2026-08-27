<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Contact</span>
      <h1 class="page-title">Hai să stăm de vorbă.</h1>
      <p class="lede">
        Sună la <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a> sau scrie la
        <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a
        >. Îți răspundem în cel mult 24 de ore, cu o recomandare de nivel dintre
        <NuxtLink to="/cursuri" class="link">cele șase</NuxtLink> și grupele cu locuri libere, la
        locația mai apropiată de tine.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-start" data-reveal>
      <div>
        <h2 class="block-title">Formular de contact</h2>
        <form class="form">
          <div class="form-row">
            <div class="field">
              <label for="contact-name">Numele tău</label>
              <input id="contact-name" class="input" type="text" placeholder="ex. Maria Ionescu" />
            </div>
            <div class="field">
              <label for="contact-reply">Telefon sau email</label>
              <input id="contact-reply" class="input" type="text" placeholder="ex. 07xx xxx xxx" />
            </div>
          </div>
          <div class="field">
            <label for="contact-subject">Subiect</label>
            <select id="contact-subject" class="input">
              <option v-for="subject in subjects" :key="subject">{{ subject }}</option>
            </select>
          </div>
          <div class="field">
            <label for="contact-message">Mesaj</label>
            <textarea
              id="contact-message"
              class="input"
              rows="5"
              placeholder="Vârsta copilului, experiența lui cu calculatorul și ce te-ar interesa…"
            ></textarea>
          </div>
          <div>
            <button type="button" class="btn btn-primary" disabled>În curând</button>
            <p class="note">
              Trimiterea din formular se activează în curând. Până atunci sună-ne sau scrie-ne pe
              email — răspundem la fel de repede.
            </p>
          </div>
        </form>
      </div>

      <div>
        <h2 class="block-title">Direct</h2>
        <div class="stack stack-wide">
          <div class="marked">
            <UIcon name="i-lucide-phone" class="marker size-4.5" />
            <div>
              <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a>
              <p class="note tnum">{{ SCHOOL_HOURS[0] }}, {{ SCHOOL_HOURS[1] }}</p>
            </div>
          </div>
          <div class="marked">
            <UIcon name="i-lucide-mail" class="marker size-4.5" />
            <div>
              <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a>
              <p class="note">Răspundem în cel mult 24 de ore</p>
            </div>
          </div>
          <div class="marked">
            <UIcon name="i-lucide-clock" class="marker size-4.5" />
            <div class="body-text tnum">
              <p v-for="hours in SCHOOL_HOURS" :key="hours">{{ hours }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" aria-label="Locații" data-reveal>
      <h2 class="kicker">Locațiile noastre</h2>
      <div class="cols-2">
        <div v-for="location in SCHOOL_LOCATIONS" :key="location.slug">
          <h3 class="sub-title">{{ location.neighbourhood }}</h3>
          <p class="body-text">
            {{ location.street }}, {{ location.district }}, {{ location.city }} ·
            <NuxtLink :to="`/locatii/${location.slug}`" class="link"
              >detalii despre locație</NuxtLink
            >
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useReveal } from "~/composables/useReveal";
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { pageSeo } from "#shared/seo";
import { schoolGraph, breadcrumbNode, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";
import {
  SCHOOL_EMAIL,
  SCHOOL_HOURS,
  SCHOOL_LOCATIONS,
  SCHOOL_PHONE,
  SCHOOL_PHONE_HREF,
} from "#shared/school";

definePageMeta({
  layout: "default" as any,
  title: "Contact",
});

useReveal();

const subjects = [
  "Întrebare despre cursuri",
  "Înscriere",
  "Parteneriat",
  "Feedback",
  "Altele",
] as const;

const seo = pageSeo("/contact");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  { ...webPageNode(site, seo), "@type": "ContactPage" },
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Contact", path: "/contact" },
  ]),
]);
</script>
