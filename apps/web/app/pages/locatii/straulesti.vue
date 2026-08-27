<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Locația Străulești</span>
      <h1 class="page-title">
        Cursuri de informatică pentru copii în Străulești și Bucureștii Noi
      </h1>
      <p class="lede">
        A doua sală a IT Bridge School e în nordul Bucureștiului, pe {{ location.street }},
        {{ location.district }}, în zona Străulești. Aceleași șase niveluri ca la Drumul Taberei, de
        la clasa 0 până la pregătirea pentru Bacalaureat, în grupe mici, cu o ședință de 1,5 ore pe
        săptămână.
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
        Sala din Străulești e făcută pentru familiile din nordul orașului și din Ilfovul de lângă
        el. Vin copii din Străulești, Bucureștii Noi, Dămăroaia și Băneasa — Sectorul 1 — dar și din
        Chitila și Mogoșoaia, care sunt la câteva minute pe Șoseaua București–Târgoviște și pentru
        care drumul până în centrul Bucureștiului ar însemna de trei ori mai mult timp.
      </p>
      <p class="body-text measure-wide">
        Fără diacritice, cum caută mulți părinți: cursuri de programare pentru copii în Straulesti,
        Bucurestii Noi, Baneasa, Chitila și Mogosoaia.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-even split-start" data-reveal>
      <!-- TODO: replace with a photograph of this room. -->
      <figure class="plate">
        <img
          src="/images/clasa-04.jpg"
          alt="Oră de programare în Scratch la IT Bridge School"
          width="1200"
          height="1113"
          loading="lazy"
        />
      </figure>
      <div>
        <h2 class="kicker">Cum ajungi la sală</h2>
        <h3 class="section-title">Cu mașina de pe șosea, sau cu metroul M4</h3>
        <p class="body-text">
          Adresa e pe Șoseaua București–Târgoviște, la ieșirea spre nord, deci cei mai mulți părinți
          vin cu mașina — inclusiv din Mogoșoaia și Chitila, fără să intre în oraș.
        </p>
        <p class="body-text">
          Cu transportul în comun, stația de metrou Străulești, capătul magistralei M4, e la
          aproximativ 1,1 km. Acolo e și terminalul de autobuze și parcarea park-and-ride, așa că un
          părinte care vine de la serviciu poate lăsa mașina și continua cu metroul.
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
            Cunoașterea calculatorului, tastatură și mouse, desen digital 2D și 3D, apoi Word,
            PowerPoint și Excel, siguranță online și primele programe în Scratch.
          </p>
        </div>
        <div>
          <h3 class="block-title">Gimnaziu și liceu</h3>
          <p class="body-text">
            Algoritmi și Scratch la clasele 5–6, apoi C++, HTML, CSS și JavaScript la 7–8, iar la
            liceu structuri de date, probleme de concurs, SQL și pregătire pentru Bacalaureat.
          </p>
        </div>
      </div>
      <p class="body-text measure-wide">
        Ce grupe se țin efectiv în Străulești în modulul curent și la ce ore se stabilește la
        înscriere. <NuxtLink to="/cursuri" class="link">Vezi programa completă →</NuxtLink>
      </p>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Adresă, program și preț</h2>
      <div class="cols-2">
        <div class="card card-lg">
          <h3 class="sub-title">{{ SCHOOL_NAME }} — {{ location.neighbourhood }}</h3>
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
            pentru doi copii din aceeași familie — al doilea copil plătește
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
          :title="`Hartă — ${SCHOOL_NAME} ${location.neighbourhood}`"
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
      <h2 class="kicker">Întrebări frecvente despre locația din Străulești</h2>
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
  faqNode,
  locationNode,
  organizationNode,
  webPageNode,
  websiteNode,
} from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({ layout: "default" as any });

useReveal();

const location = findLocation("straulesti")!;

const faq = [
  {
    question: "Veniți și copii din Mogoșoaia sau Chitila?",
    answer:
      "Da. Sala e pe Șoseaua București–Târgoviște, la câteva minute de Mogoșoaia și Chitila, așa " +
      "că familiile din Ilfovul de nord ajung aici mai repede decât în oraș.",
  },
  {
    question: "Se poate ajunge cu metroul?",
    answer:
      "Da. Stația Străulești, capătul magistralei M4, e la aproximativ 1,1 km de sală, iar acolo " +
      "sunt și terminalul de autobuze și parcarea park-and-ride.",
  },
  {
    question: "Ce se întâmplă la prima ședință?",
    answer:
      "Facem o evaluare scurtă, ca să vedem de unde pornește copilul, apoi intră în grupa " +
      "potrivită nivelului lui. Fiecare ședință durează 1,5 ore și se încheie cu ceva construit " +
      "de copil.",
  },
  {
    question: "Cursurile sunt aceleași ca la Drumul Taberei?",
    answer:
      "Da. Aceleași șase niveluri, aceeași programă și același preț: 350 de " +
      "lei pe lună pentru un copil, 600 pentru doi copii din aceeași familie.",
  },
];

const seo = pageSeo("/locatii/straulesti");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  organizationNode(site),
  websiteNode(site),
  webPageNode(site, seo),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Locații", path: "/locatii" },
    { name: location.neighbourhood, path: `/locatii/${location.slug}` },
  ]),
  locationNode(site, location),
  faqNode(faq),
]);
</script>
