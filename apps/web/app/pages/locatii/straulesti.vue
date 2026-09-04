<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Locația Străulești</span>
      <h1 class="page-title">Cursuri de informatică pentru copii în Străulești</h1>
      <p class="lede">
        A doua sală a IT Bridge School e în nordul Bucureștiului, pe {{ location.street }},
        {{ location.district }}, în Străulești, la câteva minute de Bucureștii Noi. Aceleași șase
        niveluri de programare ca la Drumul Taberei, de la clasa 0 până la pregătirea pentru
        Bacalaureat, în grupe mici, cu o ședință de 1,5 ore pe săptămână.
      </p>
      <p class="note">Actualizat: {{ CONTENT_UPDATED }}</p>
      <div class="actions">
        <a :href="SCHOOL_PHONE_HREF" class="btn btn-primary tnum">{{ SCHOOL_PHONE }}</a>
        <a :href="location.mapLink" class="btn btn-ghost" target="_blank" rel="noopener">
          Deschide în Google Maps
        </a>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Pentru cine e această locație</h2>
      <p class="body-text measure-wide">
        Sala din Străulești e făcută pentru familiile din nordul orașului. Vin copii din Străulești
        și din Bucureștii Noi, din Dămăroaia și din Băneasa. Vin și din Chitila și din Mogoșoaia,
        care sunt la câteva minute pe Șoseaua București-Târgoviște și pentru care un curs în centrul
        Bucureștiului ar însemna un drum mult mai lung.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-even split-start" data-reveal>
      <figure class="plate">
        <NuxtPicture
          format="webp"
          :src="location.image"
          :alt="location.imageAlt"
          width="900"
          height="910"
          sizes="sm:100vw md:50vw lg:560px"
          loading="lazy"
        />
      </figure>
      <div>
        <h2 class="kicker">Cum ajungi pe șosea</h2>
        <h3 class="section-title">Cu mașina de pe șosea, sau cu metroul M4</h3>
        <p class="body-text">
          Adresa e pe Șoseaua București-Târgoviște, la ieșirea spre nord, deci cei mai mulți părinți
          vin cu mașina, inclusiv din Mogoșoaia și Chitila, fără să intre în oraș.
        </p>
        <p class="body-text">
          Cu transportul în comun, stația de metrou Străulești, capătul magistralei M4, e la
          aproximativ 1,1 km. Acolo e și terminalul de autobuze, și parcarea park-and-ride, așa că
          un părinte care vine de la serviciu poate lăsa mașina acolo și continua cu autobuzul.
        </p>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce învață copiii aici</h2>
      <div class="cols-2">
        <div>
          <h3 class="block-title">Cei mici, de la clasa 0 la a 4-a</h3>
          <p class="body-text">
            Cunoașterea calculatorului, tastatură și mouse, desen digital 2D în
            <NuxtLink to="/cursuri/canva" class="link">Canva</NuxtLink> și 3D în
            <NuxtLink to="/cursuri/tinkercad" class="link">Tinkercad</NuxtLink>, apoi
            <NuxtLink to="/cursuri/office" class="link">Word, PowerPoint și Excel</NuxtLink>,
            siguranță online și primele programe în
            <NuxtLink to="/cursuri/scratch" class="link">Scratch</NuxtLink>.
          </p>
        </div>
        <div>
          <h3 class="block-title">Gimnaziu și liceu</h3>
          <p class="body-text">
            Algoritmi, Scratch și primele pagini web la clasele 5–6, apoi
            <NuxtLink to="/cursuri/cpp" class="link">C++</NuxtLink>, HTML, CSS și JavaScript la 7–8,
            iar la liceu structuri de date, probleme de concurs, SQL și
            <NuxtLink to="/cursuri/bac-informatica" class="link"
              >meditații pentru Bacalaureat</NuxtLink
            >.
          </p>
        </div>
      </div>
      <p class="body-text measure-wide">
        Grupele din Străulești se formează înainte de fiecare modul, iar orarul se stabilește
        atunci, în funcție de înscrieri. Sună-ne dacă vrei un loc și te anunțăm.
        <NuxtLink to="/cursuri" class="link">Vezi programa completă →</NuxtLink>
      </p>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Adresa și programul</h2>
      <div class="cols-2">
        <div class="card card-lg">
          <h3 class="sub-title">{{ SCHOOL_NAME }}, {{ location.neighbourhood }}</h3>
          <p class="body-text">
            {{ location.street }}<br />
            {{ location.district }}, {{ location.postalCode }} {{ location.city }}
          </p>
          <p class="body-text">
            Telefon: <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
            ><br />
            Email: <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a>
          </p>
          <p v-for="hours in SCHOOL_HOURS" :key="hours" class="note tnum">{{ hours }}</p>
        </div>
        <div class="card card-lg">
          <h3 class="sub-title">Cât costă</h3>
          <p class="body-text">
            {{ PRICE_ONE_CHILD }} lei pe lună pentru un copil. {{ PRICE_TWO_CHILDREN }} lei pe lună
            pentru doi copii din aceeași familie: al doilea copil plătește
            {{ PRICE_TWO_CHILDREN - PRICE_ONE_CHILD }} lei. Un modul durează 6–8 săptămâni.
          </p>
          <p class="body-text">
            Aceleași prețuri ca la
            <NuxtLink to="/locatii/drumul-taberei" class="link">locația din Drumul Taberei</NuxtLink
            >.
          </p>
        </div>
      </div>
      <div class="plate map-plate">
        <iframe
          :src="location.mapEmbedUrl"
          :title="`Hartă: ${SCHOOL_NAME} ${location.neighbourhood}`"
          width="100%"
          height="320"
          style="border: 0"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"
        ></iframe>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Ce ne întreabă părinții din nordul orașului</h2>
      <div class="cols-2">
        <div v-for="entry in faq" :key="entry.question">
          <h3 class="sub-title">{{ entry.question }}</h3>
          <p class="body-text">{{ entry.answer }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Vino să vezi sala din Străulești</h2>
      <p class="body-text measure-wide">
        Sună-ne și stabilim o vizită pe {{ location.street }}. Îți spunem ce grupe sunt libere și ce
        nivel i se potrivește copilului.
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
import {
  findLocation,
  SCHOOL_EMAIL,
  SCHOOL_HOURS,
  SCHOOL_NAME,
  SCHOOL_PHONE,
  SCHOOL_PHONE_HREF,
} from "#shared/school";
import { PRICE_ONE_CHILD, PRICE_TWO_CHILDREN } from "#shared/courses";
import { CONTENT_UPDATED, pageSeo } from "#shared/seo";
import {
  breadcrumbNode,
  ids,
  schoolGraph,
  webPageNode,
  withFaq,
  withImage,
} from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" });

useReveal();

const location = findLocation("straulesti")!;

const faq = [
  {
    question: "Vin copii și din Mogoșoaia sau din Chitila?",
    answer:
      "Da. Sala din Străulești e pe Șoseaua București-Târgoviște, la câteva minute de Mogoșoaia " +
      "și de Chitila, așa că familiile din nordul Ilfovului ajung la IT Bridge School fără să " +
      "intre în oraș.",
  },
  {
    question: "Se poate ajunge cu metroul?",
    answer:
      "Da. Stația Străulești, capătul magistralei M4, e la aproximativ 1,1 kilometri de sala din " +
      "Străulești, iar de acolo drumul se continuă cu autobuzul. În stație sunt și terminalul de " +
      "autobuze, și parcarea park-and-ride, așa că mașina poate fi lăsată acolo.",
  },
  {
    question: "Cursurile sunt aceleași ca la Drumul Taberei?",
    answer:
      "Da: aceleași șase niveluri, aceeași programă și același preț. Diferă doar sala și orarul " +
      "grupelor, care depinde de câți copii sunt înscriși pe fiecare nivel la fiecare locație.",
  },
  {
    question: "Faceți meditații pentru Bacalaureatul la informatică în Străulești?",
    answer:
      `Da, în grupe mici, la sala de pe ${location.street}: probleme tip din variantele de ` +
      "examen, scrise în C++, corecturi la fiecare ședință, cu un profesor care a luat el " +
      "însuși Bacalaureatul cu 10 la informatică. Nivelul e pentru clasa 9–12 și pentru " +
      "ultimul an.",
  },
];

const seo = pageSeo("/locatii/straulesti");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  withImage(
    withFaq(webPageNode(site, seo, ids.location(site, location.slug)), faq),
    site,
    location.image,
    location.imageAlt
  ),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Locații", path: "/locatii" },
    { name: location.neighbourhood, path: `/locatii/${location.slug}` },
  ]),
]);
</script>
