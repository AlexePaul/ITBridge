<template>
  <div class="page">
    <section class="section-hero" data-reveal>
      <h1 class="display">
        <span>Copiii nu doar folosesc tehnologia.</span>
        <span>La noi învață să o creeze.</span>
      </h1>
      <p class="lede lede-loose">
        IT Bridge School este o școală de informatică pentru copii, cu două locații în București —
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

    <section class="section" aria-label="IT Bridge School, în cifre" data-reveal>
      <div class="stats-grid">
        <div v-for="stat in stats" :key="stat.label">
          <p class="stat-num" :class="{ 'stat-accent': stat.highlighted }">
            <AnimatedNumber :value="stat.value" />
          </p>
          <p class="stat-label">{{ stat.label }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker tnum">Ce învață copiii</h2>
      <div class="cols-3 cols-ruled">
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
          nivelurile mici, un joc în Scratch la mijloc, o pagină web sau un program în C++ la cele
          mari. Grupele mici înseamnă că profesorul ajunge la fiecare, la fiecare oră.
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
      <p class="pull-quote">
        Un copil care termină un modul la IT Bridge School pleacă cu ceva ce a construit — și cu
        obiceiul de a se întreba cum funcționează lucrurile.
      </p>
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
import { schoolGraph, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({
  layout: "default" as any,
  title: "Acasă",
});

useReveal();

const seo = pageSeo("/");
useSeo({ ...seo, imageAlt: "IT Bridge School — cursuri de informatică pentru copii" });

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([...schoolGraph(site), webPageNode(site, seo)]);

const photos = [
  {
    src: "/images/paul-ana.jpg",
    alt: "Alexe Vasile Paul și Alexe Ana Iulia, profesorii IT Bridge School",
  },
  { src: "/images/clasa-01.jpg", alt: "Trei elevi lucrând la laptopuri, în timpul orei" },
  { src: "/images/clasa-02.jpg", alt: "Recapitulare cu rebus, proiectată pe tablă" },
  {
    src: "/images/clasa-03.jpg",
    alt: "Oră despre istoria calculatoarelor, cu profesorul la tablă",
  },
  {
    src: "/images/clasa-04.jpg",
    alt: "Oră de programare în Scratch, cu proiectul afișat pe tablă",
  },
];

const stats = [
  { value: "2", label: "Locații în București", highlighted: true },
  { value: "6", label: "Niveluri, de la clasa 0 la BAC", highlighted: false },
  { value: "6–8", label: "Săptămâni într-un modul", highlighted: false },
  { value: "1,5", label: "Ore pe ședință", highlighted: false },
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
      "problemelor — abilități care se văd la școală, la examene și mult după.",
  },
  {
    title: "Creativitate digitală",
    body:
      "Cu Scratch, Tinkercad și Canva, copiii explorează latura creativă a tehnologiei: desen " +
      "digital, modelare 3D și proiecte pe care le arată cu mândrie acasă.",
  },
];
</script>
