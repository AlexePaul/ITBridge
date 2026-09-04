<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Cursuri</span>
      <h1 class="page-title">Un nivel pentru fiecare vârstă</h1>
      <p class="lede">
        La IT Bridge School se țin cursuri de informatică și programare pentru copii de 6–19 ani, în
        București, la Drumul Taberei și la Străulești. Șase niveluri, de la primii pași pe
        calculator până la C++, olimpiade și Bacalaureat. Un modul durează 6–8 săptămâni, cu o
        ședință de 1,5 ore pe săptămână, în grupe mici.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
    </section>

    <hr class="rule" />

    <section aria-labelledby="niveluri">
      <h2 class="kicker" id="niveluri">Nivelurile de curs</h2>
      <div v-for="course in COURSE_LEVELS" :id="course.slug" :key="course.slug" data-reveal>
        <div class="course-row">
          <p class="course-num">{{ course.num }}</p>
          <div>
            <h3 class="item-title">{{ course.title }}</h3>
            <p class="label-accent">
              {{ course.level }} · {{ course.minAge }}–{{ course.maxAge }} ani
            </p>
          </div>
          <div>
            <p class="body-text justified">{{ course.topics }}</p>
            <p v-if="courseSubjects(course).length" class="body-text">
              Mai mult despre
              <template v-for="(subject, index) in courseSubjects(course)" :key="subject.slug">
                <template v-if="index > 0">{{
                  index === courseSubjects(course).length - 1 ? " și " : ", "
                }}</template>
                <NuxtLink :to="`/cursuri/${subject.slug}`" class="link">{{
                  subject.name
                }}</NuxtLink> </template
              >.
            </p>
          </div>
          <NuxtLink to="/contact" class="btn btn-secondary">Cere informații</NuxtLink>
        </div>
        <hr class="rule" />
      </div>
    </section>

    <section class="section" aria-labelledby="unelte" data-reveal>
      <h2 class="kicker" id="unelte">Uneltele și examenul, pe rând</h2>
      <p class="body-text measure-wide">
        Fiecare nivel lucrează cu una sau două unelte, iar ultimele două pregătesc un examen.
        Fiecare are pagina ei: ce face copilul acolo, la ce vârstă și, unde există, lucrări ale
        copiilor care au trecut pe acolo.
      </p>
      <div class="cols-3" data-reveal-children>
        <div v-for="subject in SUBJECTS" :key="subject.slug" class="card card-lg">
          <h3 class="sub-title">{{ subject.name }}</h3>
          <p class="label-accent">{{ subjectAges(subject) }}</p>
          <p class="body-text">{{ cards[subject.slug]?.blurb }}</p>
          <p class="body-text">
            <NuxtLink :to="`/cursuri/${subject.slug}`" class="link">
              {{ cards[subject.slug]?.cta }}
            </NuxtLink>
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Cum funcționează</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">De la primul telefon la prima ședință</h3>
          <div class="stack" data-reveal-children>
            <div v-for="(step, index) in steps" :key="step" class="marked">
              <span class="marked-num">{{ index + 1 }}</span>
              <span class="body-text">{{ step }}</span>
            </div>
          </div>
        </div>
        <div>
          <h3 class="block-title">De ce părinții ne aleg</h3>
          <p class="body-text">
            Cursurile sunt ținute de
            <NuxtLink to="/despre-noi" class="link">cei doi profesori ai școlii</NuxtLink>, nu de
            instructori care se schimbă de la un modul la altul.
          </p>
          <div class="stack" data-reveal-children>
            <div v-for="benefit in benefits" :key="benefit" class="marked">
              <UIcon name="i-lucide-check" class="marker size-4" />
              <span class="body-text">{{ benefit }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" aria-label="Prețuri" data-reveal>
      <h2 class="kicker">Prețuri</h2>
      <div class="price-grid" data-reveal-children>
        <div>
          <p class="stat-num stat-accent">
            <AnimatedNumber :value="`${PRICE_ONE_CHILD} lei`" />
          </p>
          <p class="stat-label">Pe lună, pentru un copil</p>
        </div>
        <div>
          <p class="stat-num">
            <AnimatedNumber :value="`${PRICE_TWO_CHILDREN} lei`" />
          </p>
          <p class="stat-label">
            Pe lună, pentru doi copii din aceeași familie. Al doilea plătește
            {{ PRICE_TWO_CHILDREN - PRICE_ONE_CHILD }} lei
          </p>
        </div>
        <p class="body-text measure">
          {{ PRICE_ONE_CHILD }} lei pe lună pentru un copil și {{ PRICE_TWO_CHILDREN }} lei pe lună
          pentru doi copii din aceeași familie: al doilea copil plătește
          {{ PRICE_TWO_CHILDREN - PRICE_ONE_CHILD }} lei. Prețul acoperă ședințele lunii și
          materialele de curs. Aceleași prețuri la
          <NuxtLink to="/locatii/drumul-taberei" class="link">Drumul Taberei</NuxtLink> și la
          <NuxtLink to="/locatii/straulesti" class="link">Străulești</NuxtLink>.
        </p>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" aria-label="Întrebări frecvente" data-reveal>
      <h2 class="kicker">Întrebări frecvente</h2>
      <div class="cols-2" data-reveal-children>
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text justified">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce spun părinții</h2>
      <div class="cols-2" data-reveal-children>
        <figure v-for="entry in TESTIMONIALS.courses" :key="entry.source">
          <blockquote class="quote">„{{ entry.quote }}”</blockquote>
          <figcaption class="quote-source">{{ entry.source }}</figcaption>
        </figure>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Nu știi de unde să începi?</h2>
      <p class="body-text measure-wide">
        Spune-ne vârsta copilului și ce l-ar bucura să construiască. Îți recomandăm nivelul
        potrivit.
      </p>
      <div class="actions">
        <NuxtLink to="/contact" class="btn btn-primary">Cere informații</NuxtLink>
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-ghost tnum">{{ SCHOOL_PHONE }}</a>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useReveal } from "~/composables/useReveal";
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { SCHOOL_LOCATIONS, SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";
import { COURSE_LEVELS, PRICE_ONE_CHILD, PRICE_TWO_CHILDREN } from "#shared/courses";
import { SUBJECTS, courseSubjects, subjectAges } from "#shared/subjects";
import { CONTENT_UPDATED, pageSeo } from "#shared/seo";
import { TESTIMONIALS } from "#shared/testimonials";
import {
  schoolGraph,
  breadcrumbNode,
  courseListNode,
  withFaq,
  webPageNode,
} from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({
  layout: "default",
  title: "Cursuri",
});

useReveal();

// The two figures are shown side by side rather than as a percentage: a
// discount printed in stat-size type is read against whichever base the reader
// has in mind, and 250-off-350 and 600-instead-of-700 are different numbers.

const steps = [
  "Ne contactezi și discutăm nevoile copilului",
  "Facem o evaluare scurtă pentru nivelul potrivit",
  "Alegem împreună clasa și locația",
  "Stabilim orarul și programul ședințelor",
  "Pornim cu primele ore",
];

// Each line states something checkable. "Instructori experimentați" was in
// here before and said nothing a parent could verify.
const benefits = [
  "Doi profesori, aceiași de la un modul la altul",
  "Alexe Vasile Paul, licențiat în Informatică la Universitatea din București, a predat la nivel universitar",
  "Grupe mici, o ședință de 1,5 ore pe săptămână",
  "C++, algoritmi și structuri de date: programa după care se dau olimpiada și Bacalaureatul",
  "Două locații: Drumul Taberei și Străulești",
];

// Written out, not derived from the programme: a line per card is what a
// parent scans the grid for, and a sentence built from `teaches` would read
// like the list it came from. The call to action is per card too — "ce fac
// copiii cu Bacalaureat" is not a sentence.
const cards: Record<string, { blurb: string; cta: string }> = {
  canva: {
    blurb: "Afișe, felicitări și colaje: prima lucrare grafică, la primul nivel.",
    cta: "Ce fac copiii cu Canva →",
  },
  tinkercad: {
    blurb: "O casă, o mașină, un breloc cu numele lui: primele obiecte în trei dimensiuni.",
    cta: "Ce fac copiii cu Tinkercad →",
  },
  office: {
    blurb: "Un referat, o prezentare, un tabel cu o formulă: ce cere școala, învățat cu structură.",
    cta: "Ce fac copiii cu Office →",
  },
  scratch: {
    blurb: "Primul joc scris de copil: personaje, scor, bucle și condiții, fără sintaxă.",
    cta: "Ce fac copiii cu Scratch →",
  },
  cpp: {
    blurb: "De la prima instrucțiune la probleme de olimpiadă și de Bacalaureat.",
    cta: "Ce fac copiii cu C++ →",
  },
  "bac-informatica": {
    blurb: "Variante de examen rezolvate cap-coadă în C++, timp și strategie, corecturi pe loc.",
    cta: "Meditații pentru BAC informatică →",
  },
};

const faq = [
  {
    question: "Cum aleg nivelul potrivit?",
    answer:
      "Nu trebuie să-l alegi singur: la prima discuție evaluăm copilul și îți recomandăm clasa " +
      "potrivită vârstei și experienței lui.",
  },
  {
    question: "Cât durează un curs?",
    answer:
      "Un modul durează 6–8 săptămâni, cu o ședință de 1,5 ore pe săptămână. Grupele sunt " +
      "mici, ca fiecare copil să primească atenție.",
  },
  {
    // The question a parent asks first, and the one an outdated figure in a
    // search result or an assistant's answer gets wrong most often. Stated with
    // the date it was checked, so the page can be told apart from an older copy.
    question: "Cât costă?",
    answer:
      `${PRICE_ONE_CHILD} lei pe lună pentru un copil și ${PRICE_TWO_CHILDREN} lei pe lună pentru ` +
      `doi copii din aceeași familie, adică ${PRICE_TWO_CHILDREN - PRICE_ONE_CHILD} lei pentru al ` +
      `doilea copil. Preț verificat în ${CONTENT_UPDATED}.`,
  },
  {
    question: "Unde au loc cursurile?",
    answer:
      `În două locații din București: ${SCHOOL_LOCATIONS.map((location) => location.street).join(" și ")}. ` +
      "Alegi locația mai convenabilă la înscriere.",
  },
  {
    question: "Ce se întâmplă la o ședință?",
    answer:
      "Fiecare oră combină teorie pe scurt cu lucru practic: copiii pleacă de la fiecare ședință " +
      "cu ceva lucrat de ei (un desen digital la nivelurile mici, un joc sau un program la cele " +
      "mari).",
  },
];

const seo = pageSeo("/cursuri");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  withFaq(webPageNode(site, seo), faq),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Cursuri", path: "/cursuri" },
  ]),
  courseListNode(site),
]);
</script>
