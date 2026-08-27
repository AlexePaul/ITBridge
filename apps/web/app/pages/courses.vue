<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Cursuri</span>
      <h1 class="page-title">Un nivel pentru fiecare vârstă.</h1>
      <p class="lede">
        Șase niveluri, de la primii pași pe calculator până la pregătirea pentru Bacalaureat și
        olimpiade. Fiecare modul durează 8 săptămâni, cu ședințe de 1,5 ore în grupe mici.
      </p>
    </section>

    <hr class="rule" />

    <section aria-label="Nivelurile de curs">
      <div v-for="course in courses" :key="course.num" data-reveal>
        <div class="course-row">
          <p class="course-num">{{ course.num }}</p>
          <div>
            <h2 class="item-title">{{ course.title }}</h2>
            <p class="label-accent">{{ course.level }}</p>
          </div>
          <p class="body-text justified">{{ course.topics }}</p>
          <NuxtLink to="/contact" class="btn btn-secondary">Cere informații</NuxtLink>
        </div>
        <hr class="rule" />
      </div>
    </section>

    <section class="section" data-reveal>
      <span class="kicker">Cum funcționează</span>
      <div class="cols-2">
        <div>
          <h2 class="block-title">De la primul telefon la prima ședință</h2>
          <div class="stack">
            <div v-for="(step, index) in steps" :key="step" class="marked">
              <span class="marked-num">{{ index + 1 }}</span>
              <span class="body-text">{{ step }}</span>
            </div>
          </div>
        </div>
        <div>
          <h2 class="block-title">De ce părinții ne aleg</h2>
          <div class="stack">
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
      <span class="kicker">Prețuri</span>
      <div class="price-grid">
        <div>
          <p class="stat-num stat-accent">{{ PRICE_ONE_CHILD }} lei</p>
          <p class="stat-label">Pe lună, pentru un copil</p>
        </div>
        <div>
          <p class="stat-num">peste {{ secondChildDiscount }}%</p>
          <p class="stat-label">
            Reducere la al doilea copil — {{ PRICE_TWO_CHILDREN }} lei pe lună pentru doi
          </p>
        </div>
        <p class="body-text measure">
          Prețul acoperă toate ședințele lunii, materialele de curs și accesul la resursele noastre.
          Detalii complete la telefon sau pe email.
        </p>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" aria-label="Întrebări frecvente" data-reveal>
      <span class="kicker">Întrebări frecvente</span>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h2 class="sub-title">{{ entry.question }}</h2>
          <p class="body-text justified">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Nu știi de unde să începi?</h2>
      <p class="body-text measure-wide">
        Spune-ne vârsta copilului și ce l-ar bucura să construiască — îți recomandăm nivelul
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
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "~/constants/school";

definePageMeta({
  layout: "default" as any,
  title: "Cursuri",
});

useReveal();

const PRICE_ONE_CHILD = 350;
const PRICE_TWO_CHILDREN = 600;

// The second child is charged the difference — 250 instead of 350. The saving
// is announced in steps of five, rounded down, so the number stays round and
// never promises more than the family actually saves.
const secondChildSaving = 1 - (PRICE_TWO_CHILDREN - PRICE_ONE_CHILD) / PRICE_ONE_CHILD;
const secondChildDiscount = Math.floor((secondChildSaving * 100) / 5) * 5;

const courses = [
  {
    num: "01",
    title: "Clasa 0–2",
    level: "Inițiere",
    topics:
      "Cunoașterea calculatorului, folosirea mouse-ului și a tastaturii, jocuri educative, " +
      "primele concepte de bază și creativitate prin desen digital 2D și 3D.",
  },
  {
    num: "02",
    title: "Clasa 3–4",
    level: "Începători",
    topics:
      "Noțiuni de bază în informatică, sisteme de operare, aplicații Office (Word, PowerPoint, " +
      "Excel), internet și siguranță online, primele programe în Scratch.",
  },
  {
    num: "03",
    title: "Clasa 5–6",
    level: "Intermediar",
    topics:
      "Introducere în algoritmi, programare în Scratch, proiecte practice și primele site-uri " +
      "web simple.",
  },
  {
    num: "04",
    title: "Clasa 7–8",
    level: "Intermediar–avansat",
    topics:
      "Programare în Python, algoritmi și instrucțiuni de bază, site-uri web cu HTML, CSS și " +
      "JavaScript, introducere în baze de date și pregătire pentru olimpiade școlare.",
  },
  {
    num: "05",
    title: "Clasa 9–12",
    level: "Avansat",
    topics:
      "Algoritmi și complexitate, programare în C/C++, structuri de date avansate, probleme de " +
      "concurs, baze de date SQL, pregătire pentru BAC și olimpiadă.",
  },
  {
    num: "06",
    title: "Pregătire Bacalaureat",
    level: "Avansat",
    topics:
      "Probleme tip pentru Bacalaureat, algoritmi de concurs, timp și strategie de examen, " +
      "feedback și corecții la fiecare ședință.",
  },
];

const steps = [
  "Ne contactezi și discutăm nevoile copilului",
  "Facem o evaluare scurtă pentru nivelul potrivit",
  "Alegem împreună clasa și locația",
  "Stabilim orarul și programul ședințelor",
  "Pornim cu primele ore",
];

const benefits = [
  "Instructori experimentați și dedicați",
  "Programe structurate, cu atenție personalizată",
  "Rezultate demonstrabile",
  "Materiale și resurse de calitate",
  "Flexibilitate în orar, la două locații",
];

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
      "Un modul durează 8 săptămâni, cu o ședință de 1,5 ore pe săptămână. Grupele sunt " +
      "mici, ca fiecare copil să primească atenție.",
  },
  {
    question: "Unde au loc cursurile?",
    answer:
      "În două locații din București — Strada Valea Oltului 73 și cea de-a doua locație a " +
      "noastră. Alegi locația mai convenabilă la înscriere.",
  },
  {
    question: "Ce se întâmplă la o ședință?",
    answer:
      "Fiecare oră combină teorie pe scurt cu lucru practic: copiii pleacă de la fiecare ședință " +
      "cu ceva construit de ei — un program, un joc, o pagină web.",
  },
];
</script>
