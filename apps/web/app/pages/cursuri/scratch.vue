<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Cursuri · Scratch</span>
      <h1 class="page-title">Scratch pentru copii: primul joc scris de ei</h1>
      <p class="lede">
        În Scratch, copiii de 9–13 ani își scriu primul joc: un personaj care sare peste obstacole,
        un scor care crește, o animație cu replici. Programul se compune din blocuri colorate, nu
        din text, deci prima oră se termină cu ceva care se mișcă pe ecran. Se predă la
        {{ levelsLine }}, în grupe mici, la Drumul Taberei și la Străulești.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <NuxtLink to="/cursuri" class="btn btn-ghost">Toate nivelurile</NuxtLink>
      </div>
    </section>

    <hr class="rule" />

    <section class="section split split-even split-start" data-reveal>
      <figure class="plate">
        <NuxtPicture
          format="webp"
          :src="image"
          :alt="imageAlt"
          width="1200"
          height="1113"
          sizes="sm:100vw md:50vw lg:560px"
          loading="lazy"
        />
      </figure>
      <div>
        <h2 class="kicker">Ce face copilul în Scratch</h2>
        <h3 class="section-title">Un joc întreg, nu un exercițiu</h3>
        <p class="body-text">
          Primul proiect e de obicei un joc simplu: un personaj pe care îl miști din taste, un
          obstacol de care trebuie să te ferești, un scor. Ca să meargă, copilul are nevoie de o
          buclă („repetă la nesfârșit”), de o condiție („dacă atinge obstacolul”) și de o variabilă
          pentru scor. Le folosește fiindcă îi trebuie, nu fiindcă sunt în programă.
        </p>
        <p class="body-text">
          În fotografie, pe tablă, lângă proiecție, sunt desenate cele două axe: poziția unui
          personaj în Scratch e un x și un y, iar copiii învață să le citească aici, înainte să le
          întâlnească la matematică.
        </p>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce rămâne după</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Ideile de programare, fără sintaxă</h3>
          <p class="body-text">
            Bucle, condiții, variabile, evenimente: aceleași noțiuni pe care le va scrie în
            <NuxtLink to="/cursuri/cpp" class="link">C++</NuxtLink> la 13–15 ani. În Scratch le
            învață fără punct și virgulă și fără erori de compilare, deci se poate concentra pe ce
            vrea să facă programul, nu pe cum se scrie.
          </p>
        </div>
        <div>
          <h3 class="block-title">Un proiect pe care îl poate arăta</h3>
          <p class="body-text">
            Jocul se joacă. Copilul îl arată acasă, îl dă unui coleg să-l încerce, îl mai schimbă a
            doua zi. Scratch e gratuit și merge în browser, așa că ce a învățat la curs poate exersa
            acasă, pe același program.
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
      <h2 class="kicker">Jocuri făcute de copii</h2>
      <SubjectGallery :subject="subject" />
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții despre Scratch</h2>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Vrei să-l vezi scriind primul joc?</h2>
      <p class="body-text measure-wide">
        Sună-ne și îți spunem la ce nivel intră copilul și ce grupe de Scratch se formează la
        locația mai apropiată de tine.
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
  withImage,
} from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" });

useReveal();

const subject = findSubject("scratch")!;
const levelsLine = subjectLevelsLine(subject);

// The one photograph on the site with Scratch in it, from the home slideshow.
const image = "/images/clasa-04.jpg";
const imageAlt =
  "Doi elevi lucrează în Scratch la laptopuri, cu proiectul afișat pe tablă și axele x și y " +
  "desenate lângă proiecție";

const faq = [
  {
    question: "E un joc, sau învață programare?",
    answer:
      "Amândouă. Blocurile din Scratch sunt instrucțiuni adevărate: o buclă e o buclă, o condiție " +
      "e o condiție. Diferența față de C++ e că nu se poate greși sintaxa, deci copilul se ocupă " +
      "doar de logică.",
  },
  {
    question: "De la ce vârstă?",
    answer:
      "Scratch intră în programă la clasa 3–4 și continuă la clasa 5–6. La prima discuție ne " +
      "uităm de unde pornește copilul și îi recomandăm nivelul: unul de a 6-a care a mai lucrat " +
      "în Scratch nu intră în aceeași grupă cu unul care deschide editorul prima oară.",
  },
  {
    question: "Poate lucra și acasă?",
    answer:
      "Da. Scratch e gratuit și merge în browser, fără instalare, așa că ce a învățat la curs " +
      "poate exersa acasă pe același program.",
  },
];

const seo = pageSeo(`/cursuri/${subject.slug}`);
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  withImage(withFaq(webPageNode(site, seo), faq), site, image, imageAlt),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Cursuri", path: "/cursuri" },
    { name: subject.name, path: `/cursuri/${subject.slug}` },
  ]),
  // The course nodes for the levels that teach it, so the page carries the
  // same Course entities /cursuri declares, not a second description of them.
  ...subjectLevels(subject).map((course) => courseNode(site, course)),
]);
</script>
