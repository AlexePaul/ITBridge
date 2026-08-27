<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Locația Drumul Taberei</span>
      <h1 class="page-title">Cursuri de informatică pentru copii în Drumul Taberei</h1>
      <p class="lede">
        IT Bridge School ține cursuri de informatică și programare pentru copii în Drumul Taberei,
        pe {{ location.street }}, {{ location.district }}. Vin copii de la clasa 0 până la a 12-a,
        în grupe mici, la o ședință de 1,5 ore pe săptămână. Sala e la 600–850 de metri de trei
        stații de metrou de pe magistrala M5.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <a :href="location.mapLink" class="btn btn-ghost" target="_blank" rel="noopener">
          Deschide în Google Maps
        </a>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Cum ajungi în Valea Oltului</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Cu metroul</h3>
          <p class="body-text">
            Trei stații de pe magistrala M5 sunt la distanță de mers pe jos: Valea Ialomiței, la
            aproximativ 600 de metri, Constantin Brâncuși, la aproximativ 650 de metri, și Râul
            Doamnei, la aproximativ 850 de metri — între șapte și douăsprezece minute de mers. Mulți
            elevi de gimnaziu vin singuri de la metrou.
          </p>
        </div>
        <div>
          <h3 class="block-title">Cu autobuzul sau cu mașina</h3>
          <p class="body-text">
            Stația de autobuz „Valea Oltului" e chiar pe stradă, iar stațiile „Valea Ialomiței" și
            „Drumul Taberei 98" sunt la câteva minute de mers. Cu mașina se ajunge dinspre
            Bulevardul Timișoara și dinspre Drumul Taberei.
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Din ce zone vin copiii aici</h2>
      <p class="body-text measure-wide">
        Locația din Drumul Taberei acoperă vestul Bucureștiului. Vin copii din Drumul Taberei,
        Militari, Ghencea și Răzoare — tot Sectorul 6, plus zonele învecinate din Sectorul 5. Dacă
        stai în nordul orașului, ai
        <NuxtLink to="/locatii/straulesti" class="link">a doua locație, în Străulești</NuxtLink>, cu
        aceleași cursuri și aceleași prețuri.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-even split-start" data-reveal>
      <div>
        <h2 class="kicker">Ce învață copiii la această sală</h2>
        <h3 class="section-title">Aceleași șase niveluri, de la clasa 0 la Bacalaureat</h3>
        <p class="body-text">
          Programa e aceeași la ambele locații: de la primii pași pe calculator și desen digital, la
          Office și siguranță online, apoi Scratch, algoritmi și primele pagini web, iar la
          nivelurile mari C++, structuri de date, pregătire pentru olimpiadă și pentru Bacalaureat.
        </p>
        <p class="body-text">
          Ce grupe se țin efectiv aici în modulul curent și la ce ore se stabilește la înscriere —
          sună-ne și îți spunem ce locuri sunt libere la Drumul Taberei.
        </p>
        <p class="body-text">
          <NuxtLink to="/cursuri" class="link">Vezi cele șase niveluri și prețurile →</NuxtLink>
        </p>
      </div>
      <!-- TODO: replace with a photograph of this room. -->
      <figure class="plate">
        <img
          src="/images/clasa-02.jpg"
          alt="Elevi la o oră de informatică la IT Bridge School"
          width="1200"
          height="1171"
          loading="lazy"
        />
      </figure>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Unde ne găsești</h2>
      <div class="cols-2">
        <div class="card card-lg">
          <h3 class="sub-title">{{ SCHOOL_NAME }} — {{ location.neighbourhood }}</h3>
          <p class="body-text">
            {{ location.street }}<br />
            {{ location.district }}, {{ location.postalCode }} {{ location.city }}
          </p>
          <p class="body-text">
            Telefon: <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
            ><br />
            Email: <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a>
          </p>
          <p v-for="hours in SCHOOL_HOURS" :key="hours" class="note tnum">{{ hours }}</p>
        </div>
        <div class="card card-lg">
          <h3 class="sub-title">Cât costă</h3>
          <p class="body-text">
            {{ PRICE_ONE_CHILD }} lei pe lună pentru un copil. {{ PRICE_TWO_CHILDREN }} lei pe lună
            pentru doi copii din aceeași familie — al doilea copil plătește
            {{ PRICE_TWO_CHILDREN - PRICE_ONE_CHILD }} lei. Un modul durează 6–8 săptămâni, cu o
            ședință de 1,5 ore pe săptămână.
          </p>
          <p class="body-text">Prețurile sunt aceleași la ambele locații.</p>
        </div>
      </div>
      <div class="plate map-plate">
        <iframe
          :src="location.mapEmbedUrl"
          :title="`Hartă — ${SCHOOL_NAME} ${location.neighbourhood}`"
          width="100%"
          height="320"
          style="border: 0"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții din Drumul Taberei</h2>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Vino să vezi sala</h2>
      <p class="body-text measure-wide">
        Sună-ne și stabilim o vizită la {{ location.street }}: vezi sala, ne cunoaștem și îți spunem
        ce grupă i s-ar potrivi copilului.
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
import {
  findLocation,
  SCHOOL_EMAIL,
  SCHOOL_HOURS,
  SCHOOL_NAME,
  SCHOOL_PHONE,
  SCHOOL_PHONE_HREF,
} from "#shared/school";
import { PRICE_ONE_CHILD, PRICE_TWO_CHILDREN } from "#shared/courses";
import { CONTENT_UPDATED, pageSeo } from "#shared/seo";
import { breadcrumbNode, schoolGraph, webPageNode, withFaq } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" as any });

useReveal();

const location = findLocation("drumul-taberei")!;

const faq = [
  {
    question: "Poate veni copilul singur, cu metroul?",
    answer:
      "Da, mulți elevi de gimnaziu vin singuri. Sala e la aproximativ 600 de metri de stația " +
      "Valea Ialomiței și la 650 de metri de Constantin Brâncuși, ambele pe magistrala M5.",
  },
  {
    question: "Locuiesc în Militari. Cum ajung?",
    answer:
      "Cu mașina, dinspre Bulevardul Timișoara. Militari nu e pe magistrala M5, care merge de la " +
      "Eroilor până la Râul Doamnei, așa că din Militari drumul cu metroul ar însemna o " +
      "schimbare — cei mai mulți părinți din Militari vin cu mașina.",
  },
  {
    question: "Copilul meu n-a mai făcut niciodată programare. E o problemă?",
    answer:
      "Nu. Trei dintre cele șase niveluri pornesc de la zero, iar la prima discuție facem o " +
      "evaluare scurtă tocmai ca să nimerim grupa potrivită.",
  },
  {
    question: "Ce grupe se țin la Drumul Taberei?",
    answer:
      "Depinde de modul: grupele se formează pe niveluri, în funcție de câți copii sunt înscriși " +
      "pe fiecare. Sună-ne și îți spunem ce grupe rulează acum la Valea Oltului și la ce ore.",
  },
];

const seo = pageSeo("/locatii/drumul-taberei");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  withFaq(webPageNode(site, seo), faq),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Locații", path: "/locatii" },
    { name: location.neighbourhood, path: `/locatii/${location.slug}` },
  ]),
]);
</script>
