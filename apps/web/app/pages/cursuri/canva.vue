<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Cursuri · Canva</span>
      <h1 class="page-title">Canva pentru copii: prima lucrare grafică</h1>
      <p class="lede">
        La 6–9 ani, primul nivel de curs, copiii fac în Canva afișe, felicitări și colaje: aleg o
        imagine, scriu un titlu, potrivesc culorile, mută lucrurile pe pagină până arată cum vor. E
        prima dată când mouse-ul și tastatura produc ceva ce se poate arăta acasă. Se predă la
        {{ levelsLine }}, în grupe mici, la Drumul Taberei și la Străulești.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <NuxtLink to="/cursuri" class="btn btn-ghost">Toate nivelurile</NuxtLink>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce face copilul în Canva</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Afișe, felicitări, colaje</h3>
          <p class="body-text">
            Un afiș pentru ziua lui, o felicitare pentru bunici, o copertă pentru o poveste scrisă
            la școală. Fiecare are un titlu, o imagine și un fundal, iar copilul decide unde stă
            fiecare și de ce. La sfârșitul orei lucrarea e gata și e a lui.
          </p>
        </div>
        <div>
          <h3 class="block-title">Ce învață pe drum</h3>
          <p class="body-text">
            Să țină mouse-ul cu încredere, să găsească literele pe tastatură, să aleagă între două
            fonturi, să alinieze. Lucruri mici care la 7 ani sunt tot exercițiul, și care la
            <NuxtLink to="/cursuri/office" class="link">Word</NuxtLink>, peste doi ani, sunt deja
            rezolvate.
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section aria-labelledby="niveluri">
      <h2 class="kicker" id="niveluri">La ce nivel se predă</h2>
      <SubjectLevels :subject="subject" />
    </section>

    <section class="section" data-reveal>
      <h2 class="kicker">Lucrări ale copiilor</h2>
      <SubjectGallery :subject="subject" />
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții despre Canva</h2>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Primul nivel, la 6 ani</h2>
      <p class="body-text measure-wide">
        Sună-ne și îți spunem ce grupe de clasa 0–2 se formează la locația mai apropiată de tine, și
        la ce oră.
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
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";
import { CONTENT_UPDATED, pageSeo } from "#shared/seo";
import { findSubject, subjectLevels, subjectLevelsLine } from "#shared/subjects";
import {
  breadcrumbNode,
  courseNode,
  schoolGraph,
  webPageNode,
  withFaq,
} from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" });

useReveal();

const subject = findSubject("canva")!;
const levelsLine = subjectLevelsLine(subject);

const faq = [
  {
    question: "De ce Canva, și nu direct programare?",
    answer:
      "La 6–7 ani, programarea începe cu mâna pe mouse și cu literele de pe tastatură. Canva le " +
      "exersează pe amândouă cu un rezultat vizibil la sfârșitul fiecărei ore, și copilul vrea " +
      "să revină.",
  },
  {
    question: "Copilul abia învață să citească.",
    answer:
      "Nivelul de clasa 0–2 e gândit pentru asta: lucrează cu imagini și cu cuvinte scurte, iar " +
      "profesoara adaptează ritmul la fiecare copil.",
  },
  {
    question: "Ce urmează după Canva?",
    answer:
      "Tot la 6–9 ani, copiii modelează și obiecte 3D în Tinkercad. La clasa 3–4 vin Word, " +
      "PowerPoint și Excel, și primele programe în Scratch.",
  },
];

const seo = pageSeo(`/cursuri/${subject.slug}`);
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  withFaq(webPageNode(site, seo), faq),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Cursuri", path: "/cursuri" },
    { name: subject.name, path: `/cursuri/${subject.slug}` },
  ]),
  ...subjectLevels(subject).map((course) => courseNode(site, course)),
]);
</script>
