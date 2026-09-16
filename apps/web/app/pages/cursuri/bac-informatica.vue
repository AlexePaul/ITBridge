<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Cursuri · Bacalaureat</span>
      <h1 class="page-title">
        Meditații pentru Bacalaureatul la informatică, în Drumul Taberei și Străulești
      </h1>
      <p class="lede">
        Pregătire pentru proba de informatică de la Bacalaureat, în grupe mici, la cele două săli
        ale IT Bridge School: pe Valea Oltului, în Drumul Taberei, și pe Șoseaua
        București-Târgoviște, în Străulești. Probleme tip din variantele de examen, scrise în C++,
        timp și strategie, corecturi la fiecare ședință. Se predă la {{ levelsLine }}, o ședință de
        1,5 ore pe săptămână, {{ PRICE_ONE_CHILD }} lei pe lună.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <NuxtLink to="/cursuri" class="btn btn-ghost">Toate nivelurile</NuxtLink>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Cum arată o ședință</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Un subiect, rezolvat până la capăt</h3>
          <p class="body-text">
            Se pornește de la un subiect din variantele de examen și se merge cap-coadă: citit cu
            atenție, gândit pe hârtie, scris în C++, testat, corectat. Ce a mers și ce nu se discută
            pe loc, la aceeași ședință, nu peste o săptămână.
          </p>
        </div>
        <div>
          <h3 class="block-title">De la pseudocod la program</h3>
          <p class="body-text">
            Cele trei subiecte cer lucruri diferite: să citești un algoritm în pseudocod și să spui
            ce face, să scrii unul de mână, să scrii un program întreg în C++. Se lucrează pe toate
            trei, în ordinea în care apar la examen, și pe timp, fiindcă la BAC timpul e parte din
            problemă.
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Cine predă</h2>
      <p class="body-text measure-wide">
        <NuxtLink to="/despre-noi" class="link">Alexe Vasile Paul</NuxtLink>: Bacalaureatul luat cu
        10 la informatică, admis la Universitatea din București pe baza rezultatelor la olimpiadele
        școlare, licențiat în Informatică, cu experiență de predare la nivel universitar. Același
        profesor de la un modul la altul. Limbajul e C++, fiindcă în el se dă examenul; mai mult pe
        pagina de <NuxtLink to="/cursuri/cpp" class="link">C++</NuxtLink>.
      </p>
    </section>

    <hr class="rule" />

    <section aria-labelledby="niveluri">
      <h2 class="kicker" id="niveluri">La ce nivel se predă</h2>
      <SubjectLevels :subject="subject" />
    </section>

    <section class="section" data-reveal>
      <h2 class="kicker">Unde</h2>
      <div class="cols-2" data-reveal-children>
        <div v-for="location in SCHOOL_LOCATIONS" :key="location.slug" class="card card-lg">
          <h3 class="sub-title">{{ location.neighbourhood }}</h3>
          <p class="body-text">
            {{ location.street }}<br />
            {{ location.district }}, {{ location.postalCode }} {{ location.city }}
          </p>
          <p class="body-text">
            <NuxtLink :to="`/locatii/${location.slug}`" class="link">
              Cum ajungi, programul și întrebările părinților de acolo →
            </NuxtLink>
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții despre BAC</h2>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Spune-ne în ce clasă e și când dă examenul</h2>
      <p class="body-text measure-wide">
        Sună-ne și îți spunem ce grupe de pregătire se formează la locația mai apropiată de tine, de
        când și la ce oră.
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
import { PRICE_ONE_CHILD, PRICE_TWO_CHILDREN } from "#shared/courses";
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

const subject = findSubject("bac-informatica")!;
const levelsLine = subjectLevelsLine(subject);

const faq = [
  {
    // "Meditații" usually means one-to-one. Say what it is here without
    // denying anything the school might offer on the phone.
    question: "E individual sau în grupă?",
    answer:
      "Cursurile sunt în grupă mică, cu același profesor de la un modul la altul: destul de mică " +
      "încât fiecare elev să primească corecturile lui la fiecare ședință.",
  },
  {
    question: "Din ce clasă merită să înceapă?",
    answer:
      "Nivelul de clasa 9–12 acoperă programa de liceu de la început; nivelul de pregătire " +
      "pentru Bacalaureat e pentru ultimul an, când se lucrează numai pe variante. Un elev de a " +
      "XI-a care vrea să înceapă devreme intră la 9–12.",
  },
  {
    question: "În ce limbaj se lucrează?",
    answer:
      "În C++, fiindcă în el se dă examenul. Se poate preda și Python, dar la BAC ar însemna de " +
      "tradus; recomandăm C și C++, și pentru olimpiadă.",
  },
  {
    question: "Cât costă?",
    answer:
      `${PRICE_ONE_CHILD} lei pe lună pentru un elev și ${PRICE_TWO_CHILDREN} lei pe lună pentru ` +
      `doi copii din aceeași familie. Același preț ca la orice alt nivel. Preț verificat în ` +
      `${CONTENT_UPDATED}.`,
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
