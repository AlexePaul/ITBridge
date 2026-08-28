<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Locația Drumul Taberei</span>
      <h1 class="page-title">Cursuri de informatică pentru copii în Drumul Taberei</h1>
      <p class="lede">
        IT Bridge School ține cursuri de informatică și programare pentru copii în Drumul Taberei,
        pe {{ location.street }}, {{ location.district }}. Vin copii de la clasa 0 până la a 12-a,
        în grupe mici, la o ședință de 1,5 ore pe săptămână. Cele mai apropiate trei stații de
        metrou de pe magistrala M5 sunt la 600–850 de metri de sală.
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
            Doamnei, la aproximativ 850 de metri, măsurat în linie dreaptă pe hartă. Înseamnă între
            șapte și douăsprezece minute de mers.
          </p>
        </div>
        <div>
          <h3 class="block-title">Cu autobuzul sau cu mașina</h3>
          <p class="body-text">
            Stația de autobuz „Valea Oltului” e chiar pe stradă, iar stațiile „Valea Ialomiței” și
            „Drumul Taberei 98” sunt la câteva minute de mers.
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Din ce zone vin copiii aici</h2>
      <p class="body-text measure-wide">
        Cei mai mulți copii vin din Drumul Taberei, pentru că sala e în cartier. Vin și din Militari
        și din Ghencea, de unde drumul cu mașina e scurt, și din Răzoare. Dacă stai în nordul
        orașului, ai
        <NuxtLink to="/locatii/straulesti" class="link">a doua locație, în Străulești</NuxtLink>, cu
        aceleași cursuri și aceleași prețuri.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-even split-start" data-reveal>
      <div>
        <h2 class="kicker">Cum se formează grupa</h2>
        <h3 class="section-title">Nivelul se stabilește înainte de prima ședință</h3>
        <p class="body-text">
          Nu alegi tu nivelul dintr-o listă. La prima discuție facem o evaluare scurtă, ca să vedem
          de unde pornește copilul: unul de clasa a 6-a care a mai lucrat în Scratch nu intră în
          aceeași grupă cu unul care deschide prima oară editorul.
        </p>
        <p class="body-text">
          Orarul se face înainte de începerea modulului, în funcție de câți copii sunt înscriși pe
          fiecare nivel. Dacă vrei un loc la Drumul Taberei, sună-ne și te anunțăm ce grupe se
          formează și la ce ore.
        </p>
        <p class="body-text">
          <NuxtLink to="/cursuri" class="link">Vezi cele șase niveluri și prețurile →</NuxtLink>
        </p>
      </div>
      <figure class="plate">
        <img
          :src="location.image"
          :alt="location.imageAlt"
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
          <h3 class="sub-title">{{ SCHOOL_NAME }}, {{ location.neighbourhood }}</h3>
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
            pentru doi copii din aceeași familie: al doilea copil plătește
            {{ PRICE_TWO_CHILDREN - PRICE_ONE_CHILD }} lei. Un modul durează 6–8 săptămâni, cu o
            ședință de 1,5 ore pe săptămână.
          </p>
          <p class="body-text">Prețurile sunt aceleași la ambele locații.</p>
        </div>
      </div>
      <div class="plate map-plate">
        <iframe
          :src="location.mapEmbedUrl"
          :title="`Hartă: ${SCHOOL_NAME} ${location.neighbourhood}`"
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
import { breadcrumbNode, ids, schoolGraph, webPageNode, withFaq } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" });

useReveal();

const location = findLocation("drumul-taberei")!;

const faq = [
  {
    question: "Poate veni copilul singur, cu metroul?",
    answer:
      "Sala e la aproximativ 600 de metri de stația Valea Ialomiței și la 650 de metri de " +
      "Constantin Brâncuși, ambele pe magistrala M5. E un drum scurt, pe care merită să-l " +
      "faceți împreună o dată, înainte să vină singur.",
  },
  {
    question: "Locuiesc în Militari. Cum ajung?",
    answer:
      "Cel mai simplu cu mașina. Militari nu e pe magistrala M5, care merge de la Eroilor până " +
      "la Râul Doamnei, așa că din Militari drumul cu metroul cere o schimbare.",
  },
  {
    question: "Copilul meu n-a mai făcut niciodată programare. E o problemă?",
    answer:
      "Nu. Primele două niveluri, clasa 0–2 și clasa 3–4, pornesc de la zero, iar la prima " +
      "discuție facem o evaluare scurtă tocmai ca să nimerim grupa potrivită.",
  },
];

const seo = pageSeo("/locatii/drumul-taberei");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  withFaq(webPageNode(site, seo, ids.location(site, location.slug)), faq),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Locații", path: "/locatii" },
    { name: location.neighbourhood, path: `/locatii/${location.slug}` },
  ]),
]);
</script>
