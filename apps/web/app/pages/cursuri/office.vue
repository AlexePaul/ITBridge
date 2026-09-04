<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Cursuri · Office</span>
      <h1 class="page-title">Word, PowerPoint și Excel pentru copii</h1>
      <p class="lede">
        La 9–11 ani, copiii învață cele trei aplicații pe care școala începe să le ceară: un referat
        cu titluri, paragrafe și imagini în Word, o prezentare cu diapozitive în PowerPoint, un
        tabel cu o formulă în Excel. Nu apăsat pe butoane la întâmplare, ci cu structură. Se predă
        la {{ levelsLine }}, în grupe mici, la Drumul Taberei și la Străulești.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <NuxtLink to="/cursuri" class="btn btn-ghost">Toate nivelurile</NuxtLink>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce face copilul în Office</h2>
      <div class="cols-3 cols-ruled">
        <div>
          <h3 class="block-title">Word</h3>
          <p class="body-text">
            Un referat despre un animal sau despre o țară: titlu, subtitluri, paragrafe, o imagine
            cu legendă, un cuprins. Copilul învață că un document are o structură înainte să aibă un
            conținut.
          </p>
        </div>
        <div>
          <h3 class="block-title">PowerPoint</h3>
          <p class="body-text">
            O prezentare pe care o ține în fața grupei: un diapozitiv de titlu, câteva idei pe
            pagină, o imagine pe fiecare, o tranziție. E lucrarea pe care copiii o arată cel mai
            des, și cea din care sunt exemplele de mai jos.
          </p>
        </div>
        <div>
          <h3 class="block-title">Excel</h3>
          <p class="body-text">
            Un tabel cu notele din semestru sau cu banii de buzunar, o coloană adunată cu o formulă,
            un grafic. Prima dată când calculatorul calculează pentru el, și copilul înțelege de ce.
          </p>
        </div>
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
          height="900"
          sizes="sm:100vw md:50vw lg:560px"
          loading="lazy"
        />
      </figure>
      <div>
        <h2 class="kicker">Și siguranța online</h2>
        <h3 class="section-title">Odată cu primele căutări pentru referat</h3>
        <p class="body-text">
          Tot la acest nivel: ce e o parolă bună, ce nu se scrie niciodată pe internet, cui îi spui
          când ceva nu e în regulă. Se învață în același timp cu primele căutări pe internet pentru
          un referat, fiindcă atunci apar și întrebările.
        </p>
        <p class="body-text">
          Primele programe în
          <NuxtLink to="/cursuri/scratch" class="link">Scratch</NuxtLink> încep tot la clasa 3–4, în
          paralel: tastatura, structura unui document și ideea de formulă sunt exact ce-i trebuie ca
          să scrie primul joc.
        </p>
      </div>
    </section>

    <hr class="rule" />

    <section aria-labelledby="niveluri">
      <h2 class="kicker" id="niveluri">La ce nivel se predă</h2>
      <SubjectLevels :subject="subject" />
    </section>

    <section class="section" data-reveal>
      <h2 class="kicker">Prezentări făcute de copii</h2>
      <SubjectGallery :subject="subject" />
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții despre Office</h2>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Clasa 3–4, la 9 ani</h2>
      <p class="body-text measure-wide">
        Sună-ne și îți spunem ce grupe se formează la locația mai apropiată de tine, și la ce oră.
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

const subject = findSubject("office")!;
const levelsLine = subjectLevelsLine(subject);

// From the home slideshow: an Office lesson, with a table on the laptops and
// the teacher's PowerPoint window projected on the board.
const image = "/images/clasa-01.jpg";
const imageAlt =
  "Oră de Office la sala din Drumul Taberei: trei elevi lucrează la un tabel pe laptopuri, cu " +
  "ecranul profesorului proiectat pe tablă";

const faq = [
  {
    question: "De ce Office la 9 ani, și nu programare?",
    answer:
      "Fiindcă la 9 ani școala îi cere un referat și o prezentare, nu un program. Iar tastatura, " +
      "structura unui document și ideea de formulă sunt exact ce-i trebuie când, la același " +
      "nivel, începe Scratch.",
  },
  {
    question: "Copilul le știe deja de acasă.",
    answer:
      "De obicei știe să deschidă programul și să scrie în el. Ce lipsește e structura: stiluri " +
      "de titlu, un cuprins care se face singur, o formulă care se copiază pe o coloană. Asta se " +
      "învață.",
  },
  {
    question: "Ce urmează?",
    answer:
      "Scratch începe la același nivel și continuă la clasa 5–6, cu algoritmi și primele pagini " +
      "web. La clasa 7–8 vin C++, HTML, CSS și JavaScript.",
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
  ...subjectLevels(subject).map((course) => courseNode(site, course)),
]);
</script>
