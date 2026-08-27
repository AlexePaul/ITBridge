<template>
  <div class="page">
    <section class="section-hero" data-reveal>
      <h1 class="display">
        <span>Copiii nu doar folosesc tehnologia.</span>
        <span>La noi învață să o creeze.</span>
      </h1>
      <p class="lede lede-loose">
        IT Bridge School este o școală de informatică pentru copii, cu două locații în București. De
        la primii pași pe calculator până la pregătirea pentru Bacalaureat și olimpiade, în grupe
        mici, cu proiecte practice la fiecare ședință.
      </p>
      <div class="actions">
        <NuxtLink to="/courses" class="btn btn-primary">Vezi cursurile</NuxtLink>
        <NuxtLink to="/contact" class="btn btn-ghost">Programează o discuție</NuxtLink>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" aria-label="IT Bridge School, în cifre" data-reveal>
      <div class="stats-grid">
        <div v-for="stat in stats" :key="stat.label">
          <p class="stat-num" :class="{ 'stat-accent': stat.highlighted }">{{ stat.value }}</p>
          <p class="stat-label">{{ stat.label }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <span class="kicker tnum">Ce învață copiii</span>
      <div class="cols-3 cols-ruled">
        <div v-for="subject in subjects" :key="subject.title">
          <h2 class="block-title">{{ subject.title }}</h2>
          <p class="body-text justified">{{ subject.body }}</p>
        </div>
      </div>
    </section>

    <section class="section split split-even" data-reveal>
      <div>
        <span class="kicker">Momentele noastre</span>
        <h2 class="section-title">Ore în care se construiește ceva, la propriu</h2>
        <p class="body-text justified measure">
          Fiecare ședință de 1,5 ore se încheie cu ceva ce copilul a făcut singur: un joc în
          Scratch, o pagină web, un program în C++. Grupele mici înseamnă că profesorul ajunge la
          fiecare, la fiecare oră.
        </p>
        <p class="body-text">
          <NuxtLink to="/about" class="link">Cunoaște echipa și locațiile →</NuxtLink>
        </p>
      </div>
      <div class="plate-xl self-end">
        <PhotoSlideshow :photos="photos" label="Momente de la orele IT Bridge School" />
      </div>
    </section>

    <section class="section-close" data-reveal>
      <figure>
        <blockquote class="pull-quote">“{{ testimonial.quote }}”</blockquote>
        <figcaption class="pull-quote-source">— {{ testimonial.author }}</figcaption>
      </figure>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Locul copilului tău e încă liber</h2>
      <p class="body-text measure-wide">
        Scrie-ne sau sună-ne: stabilim împreună nivelul potrivit și grupa cu locuri libere, la
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
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "~/constants/school";

definePageMeta({
  layout: "default" as any,
  title: "Acasă",
});

useReveal();

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

// TODO: replace with a real testimonial before launch.
const testimonial = {
  quote:
    "După un modul, fiul meu a trecut de la jocuri pe tabletă la a-și face propriul joc în " +
    "Scratch. Vine de la ore povestind ce a construit.",
  author: "părinte, grupa de clasa 3-4",
};
</script>
