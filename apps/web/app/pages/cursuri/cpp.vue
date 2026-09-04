<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Cursuri · C++</span>
      <h1 class="page-title">C++ pentru elevi: de la prima instrucțiune la Bacalaureat</h1>
      <p class="lede">
        C++ e limbajul în care se dau olimpiada de informatică și Bacalaureatul, și limbajul în care
        elevii de 13–19 ani învață la IT Bridge School să programeze cu adevărat: algoritmi,
        vectori, structuri de date, probleme de concurs. Se predă la {{ levelsLine }}, cu un nivel
        separat de pregătire pentru BAC, în grupe mici, la Drumul Taberei și la Străulești.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <NuxtLink to="/cursuri" class="btn btn-ghost">Toate nivelurile</NuxtLink>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce probleme rezolvă</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Clasa 7–8: de la instrucțiuni repetitive la primele olimpiade</h3>
          <p class="body-text">
            Primele programe fac lucruri mici și verificabile: prelucrează cifrele unui număr, decid
            dacă e prim, parcurg un șir citit de la tastatură. De acolo, pas cu pas, până la
            probleme cu enunț de olimpiadă de gimnaziu, rezolvate până la capăt în ședință: citit,
            gândit, scris, testat.
          </p>
        </div>
        <div>
          <h3 class="block-title">Clasa 9–12: de la vectori la grafuri</h3>
          <p class="body-text">
            Programa de liceu, și ce cer concursurile pe deasupra: tablouri și șiruri de caractere,
            recursivitate, sortări și căutări, structuri de date, algoritmi pe grafuri,
            complexitate. Problemele sunt de tipul celor de la Bacalaureat și de la concursuri, și
            fiecare se termină cu un program care merge.
          </p>
        </div>
      </div>
      <p class="body-text measure-wide">
        Aici nu sunt lucrări de arătat pe ecran, și e în regulă: la C++, rezultatul unei ore e o
        problemă rezolvată corect, nu o imagine. Ce rămâne e un caiet cu probleme rezolvate și, la
        capăt, un examen dat în limbajul în care s-a antrenat.
      </p>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">De ce C++</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Limbajul examenelor</h3>
          <p class="body-text">
            Se poate preda și Python. Recomandăm C și C++ fiindcă acelea se dau la Bacalaureat și la
            olimpiada de informatică: un elev care le știe nu mai are de tradus nimic în ziua
            examenului. Cine vine din
            <NuxtLink to="/cursuri/scratch" class="link">Scratch</NuxtLink> recunoaște buclele și
            condițiile; le scrie acum cu sintaxa lor.
          </p>
        </div>
        <div>
          <h3 class="block-title">Cine predă</h3>
          <p class="body-text">
            Cursul e ținut de
            <NuxtLink to="/despre-noi" class="link">Alexe Vasile Paul</NuxtLink>, licențiat în
            Informatică la Universitatea din București, admis pe baza rezultatelor la olimpiadele
            școlare, cu Bacalaureatul luat cu 10 la informatică și cu experiență de predare la nivel
            universitar. Exemplele de la ore vin din munca lui de programator.
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
      <p class="body-text measure-wide">
        Pentru ultimul an de liceu există un nivel separat,
        <NuxtLink to="/cursuri/bac-informatica" class="link">Pregătire Bacalaureat</NuxtLink>:
        probleme tip din variantele de examen, timp și strategie, corecturi la fiecare ședință.
      </p>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții despre C++</h2>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Spune-ne în ce clasă e</h2>
      <p class="body-text measure-wide">
        Sună-ne și îți spunem dacă intră la 7–8 sau la 9–12, ce grupe se formează și la ce oră, la
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
} from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" });

useReveal();

const subject = findSubject("cpp")!;
const levelsLine = subjectLevelsLine(subject);

const faq = [
  {
    // The school's position, stated the same way in llms.txt.
    question: "De ce C++ și nu Python?",
    answer:
      "Se poate preda și Python. Recomandăm C și C++ fiindcă acelea se dau la Bacalaureat și la " +
      "olimpiada de informatică: un elev care le știe nu mai are de tradus nimic la examen.",
  },
  {
    // U+2060 between the plus signs: a line may legally break there, and in a
    // heading it did — "C+" on one line, "+?" on the next. withFaq strips it
    // before the graph, so the indexed question stays plain "C++".
    question: "Copilul n-a programat niciodată. Poate începe direct cu C\u2060+\u2060+?",
    answer:
      "Da. Nivelul de clasa 7–8 pornește de la prima instrucțiune. Scratch înainte ajută, dar " +
      "nu e o condiție.",
  },
  {
    question: "Pregătirea pentru BAC e același curs?",
    answer:
      "Nu. Pentru clasa a XII-a există un nivel separat, cu probleme tip din variantele de examen, " +
      "timp și strategie de examen și corecturi la fiecare ședință.",
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
