<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Cursuri · Tinkercad</span>
      <h1 class="page-title">Tinkercad pentru copii: primele obiecte în trei dimensiuni</h1>
      <p class="lede">
        În Tinkercad, copiii de 6–9 ani construiesc obiecte 3D din forme simple: o casă din cuburi
        și o prismă, o mașină din cilindri, un breloc cu numele lor scobit în el. Rotesc, aliniază,
        măsoară. E desen digital în trei dimensiuni, la primul nivel de curs. Se predă la
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
      <h2 class="kicker">Ce face copilul în Tinkercad</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Ce construiește</h3>
          <p class="body-text">
            Pornește de la cuburi, sfere și cilindri. Le unește, le scobește, le pune una peste
            alta. O casă are pereți, un acoperiș și o gaură pentru ușă; un breloc are litere în
            relief. Fiecare obiect e o problemă: din ce forme e făcut și în ce ordine se pun.
          </p>
        </div>
        <div>
          <h3 class="block-title">Ce învață pe drum</h3>
          <p class="body-text">
            Să vadă un obiect ca pe o sumă de forme simple, să se orienteze pe trei axe în loc de
            două, să măsoare în milimetri. Peste câțiva ani va face exact același lucru cu o
            problemă de <NuxtLink to="/cursuri/cpp" class="link">programare</NuxtLink>: o va desface
            în bucăți pe care știe să le rezolve. În paralel, tot la acest nivel, lucrează și în
            două dimensiuni, în <NuxtLink to="/cursuri/canva" class="link">Canva</NuxtLink>.
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
      <h2 class="kicker">Obiecte făcute de copii</h2>
      <SubjectGallery :subject="subject" />
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții despre Tinkercad</h2>
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

const subject = findSubject("tinkercad")!;
const levelsLine = subjectLevelsLine(subject);

const faq = [
  {
    question: "E același Tinkercad de pe internet?",
    answer:
      "Da. Tinkercad e gratuit și merge în browser, fără instalare, așa că ce a învățat la curs " +
      "poate exersa acasă pe același program.",
  },
  {
    question: "Se pot imprima 3D?",
    answer:
      "Da, dar nu la noi: la curs lucrăm pe ecran. Modelul se exportă din Tinkercad în " +
      "formatul imprimantelor 3D, deci se poate imprima oriunde există una.",
  },
  {
    question: "Ce legătură are cu programarea?",
    answer:
      "Gândirea în spațiu, precizia și descompunerea unui obiect în forme sunt exact abilitățile " +
      "de care are nevoie un copil când ajunge, la 13 ani, să scrie primul program în C++.",
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
