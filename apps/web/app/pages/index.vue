<template>
  <div class="page">
    <!--
      `data-intro` rather than `data-reveal`: the first screen is above the
      fold on every device, so it has nothing to wait for an observer for. The
      inner span of each display line is what the line's mask slides — the
      outer one is the mask.
    -->
    <section class="section-hero" data-intro>
      <h1 class="display">
        <span><span>Copiii nu doar folosesc tehnologia. </span></span>
        <span><span>La noi învață să o creeze</span></span>
      </h1>
      <p class="lede lede-loose">
        IT Bridge School este o școală de informatică pentru copii, cu două locații în București:
        <NuxtLink to="/locatii/drumul-taberei" class="link">Drumul Taberei</NuxtLink> și
        <NuxtLink to="/locatii/straulesti" class="link">Străulești</NuxtLink>. De la primii pași pe
        calculator până la C++, olimpiade și pregătirea pentru Bacalaureat, în grupe mici, cu
        proiecte practice la fiecare ședință.
      </p>
      <div class="actions">
        <NuxtLink to="/cursuri" class="btn btn-primary">Vezi cursurile</NuxtLink>
        <NuxtLink to="/contact" class="btn btn-ghost">Programează o discuție</NuxtLink>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" aria-label="IT Bridge School, în cifre">
      <div class="stats-grid" data-reveal-children>
        <div v-for="stat in stats" :key="stat.label">
          <p class="stat-num">
            <AnimatedNumber :value="stat.value" />
          </p>
          <p class="stat-label">{{ stat.label }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker tnum">Ce învață copiii</h2>
      <div class="cols-3 cols-ruled" data-reveal-children>
        <div v-for="subject in subjects" :key="subject.title">
          <h3 class="block-title">{{ subject.title }}</h3>
          <p class="body-text justified">{{ subject.body }}</p>
        </div>
      </div>
    </section>

    <section class="section split split-even" data-reveal>
      <div>
        <h2 class="kicker">Momentele noastre</h2>
        <h3 class="section-title">Ore în care se construiește ceva, la propriu</h3>
        <p class="body-text justified measure">
          Fiecare ședință de 1,5 ore se termină cu ceva lucrat de copil: un desen digital la
          nivelurile mici, un joc în
          <NuxtLink to="/cursuri/scratch" class="link">Scratch</NuxtLink> la mijloc, o pagină web
          sau un program în <NuxtLink to="/cursuri/cpp" class="link">C++</NuxtLink> la cele mari.
          Grupele sunt mici tocmai ca profesorul să ajungă la fiecare copil în timpul orei, nu doar
          la cei care ridică mâna.
        </p>
        <p class="body-text">
          <NuxtLink to="/despre-noi" class="link">Cunoaște echipa și locațiile →</NuxtLink>
        </p>
      </div>
      <div class="plate-xl self-end">
        <PhotoSlideshow :photos="photos" label="Momente de la orele IT Bridge School" />
      </div>
    </section>

    <section class="section-close" data-reveal>
      <figure>
        <blockquote class="pull-quote">„{{ TESTIMONIALS.home.quote }}”</blockquote>
        <figcaption class="pull-quote-source">{{ TESTIMONIALS.home.source }}</figcaption>
      </figure>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Vezi ce locuri sunt libere</h2>
      <p class="body-text measure-wide">
        Scrie-ne sau sună-ne: stabilim împreună nivelul potrivit și verificăm ce grupe au locuri, la
        locația mai aproape de tine.
      </p>
      <div class="actions">
        <NuxtLink to="/contact" class="btn btn-primary">Scrie-ne</NuxtLink>
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-ghost tnum">{{ SCHOOL_PHONE }}</a>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useReveal } from "~/composables/useReveal";
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";
import { pageSeo } from "#shared/seo";
import { TESTIMONIALS } from "#shared/testimonials";
import { schoolGraph, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({
  layout: "default",
  title: "Acasă",
});

useReveal();

const seo = pageSeo("/");
useSeo({ ...seo, imageAlt: "IT Bridge School, cursuri de informatică pentru copii" });

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([...schoolGraph(site), webPageNode(site, seo)]);

const photos = [
  {
    src: "/images/paul-ana.jpg",
    alt: "Alexe Vasile Paul și Alexe Ana Iulia, profesorii IT Bridge School",
  },
  { src: "/images/clasa-01.jpg", alt: "Oră la sala din Drumul Taberei, elevi la laptopuri" },
  { src: "/images/clasa-02.jpg", alt: "Recapitulare cu rebus, la sala din Drumul Taberei" },
  {
    src: "/images/straulesti-01.jpg",
    alt: "Oră la sala din Străulești, cu profesorul lângă un elev",
  },
  {
    src: "/images/clasa-03.jpg",
    alt: "Oră despre istoria calculatoarelor, la sala din Drumul Taberei",
  },
  {
    src: "/images/clasa-04.jpg",
    alt: "Doi elevi lucrează în Scratch, cu proiectul afișat pe tabla din sala de curs",
  },
  {
    src: "/images/straulesti-02.jpg",
    alt: "Oră despre combinațiile de taste, la sala din Străulești",
  },
];

// No accent on any of them: one gold numeral pulled the eye to whichever
// figure carried it, and that was the number of addresses — the least
// interesting thing about the school. Order carries the emphasis instead.
const stats = [
  { value: "6", label: "Niveluri, de la clasa 0 la BAC" },
  { value: "6–8", label: "Săptămâni într-un modul" },
  { value: "1,5", label: "Ore pe ședință" },
  { value: "2", label: "Locații în București" },
];

const subjects = [
  {
    title: "Programare",
    body:
      "De la Scratch la C și C++, în funcție de vârstă și nivel. Copiii scriu cod de la " +
      "primele ore și ajung, pas cu pas, la algoritmi, structuri de date și probleme de concurs.",
  },
  {
    title: "Gândire logică",
    body:
      "Exercițiile și proiectele practice antrenează gândirea critică și descompunerea " +
      "problemelor, abilități care se văd la școală, la examene și mult după.",
  },
  {
    title: "Creativitate digitală",
    body:
      "Cu Scratch, Tinkercad și Canva, copiii explorează latura creativă a tehnologiei: desen " +
      "digital, modelare 3D și proiecte pe care le arată cu mândrie acasă.",
  },
];
</script>
