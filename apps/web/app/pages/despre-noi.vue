<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Despre noi</span>
      <h1 class="page-title">Transformăm copiii în creatori de tehnologie</h1>
      <p class="lede justified">
        IT Bridge School este o școală de informatică pentru copii, cu două locații în București.
        Credem că fiecare copil merită șansa de a-și atinge potențialul în IT — și că învățarea
        merge cel mai bine prin practică: proiecte reale, grupe mici și profesori care ajung la
        fiecare elev.
      </p>
    </section>

    <hr class="rule" />

    <section class="section">
      <h2 class="kicker">Echipa</h2>

      <div class="split split-reverse split-start section" data-reveal>
        <figure class="plate portrait plate-md">
          <img :src="paul.image" :alt="paul.imageAlt" width="900" height="1350" loading="lazy" />
        </figure>
        <div>
          <h3 class="section-title" :id="paul.slug">{{ paul.name }}</h3>
          <p class="label-accent">{{ paul.role }}</p>
          <p class="body-text justified">{{ paul.bio }}</p>
          <div class="stack">
            <div v-for="item in paul.highlights" :key="item" class="marked">
              <UIcon name="i-lucide-arrow-right" class="marker size-4" />
              <span class="body-text">{{ item }}</span>
            </div>
          </div>
        </div>
      </div>

      <hr class="rule" />

      <div class="split split-start section" data-reveal>
        <div>
          <h3 class="section-title" :id="ana.slug">{{ ana.name }}</h3>
          <p class="label-accent">{{ ana.role }}</p>
          <p class="body-text justified">{{ ana.bio }}</p>
          <div class="stack">
            <div v-for="item in ana.highlights" :key="item" class="marked">
              <UIcon name="i-lucide-arrow-right" class="marker size-4" />
              <span class="body-text">{{ item }}</span>
            </div>
          </div>
        </div>
        <figure class="plate portrait plate-md self-end">
          <img :src="ana.image" :alt="ana.imageAlt" width="900" height="1350" loading="lazy" />
        </figure>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <figure>
        <blockquote class="quote measure-wide">“{{ TESTIMONIALS.about.quote }}”</blockquote>
        <figcaption class="quote-source">— {{ TESTIMONIALS.about.source }}</figcaption>
      </figure>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <h2 class="kicker">Valorile noastre</h2>
      <div class="cols-3 cols-ruled">
        <div v-for="value in values" :key="value.title">
          <h3 class="block-title">{{ value.title }}</h3>
          <p class="body-text justified">{{ value.body }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" aria-label="Locațiile noastre" data-reveal>
      <h2 class="kicker">Locațiile noastre</h2>
      <div class="cols-2">
        <div v-for="location in SCHOOL_LOCATIONS" :key="location.slug" class="card card-lg">
          <h3 class="sub-title">{{ location.neighbourhood }}</h3>
          <p class="body-text">
            {{ location.street }}<br />{{ location.district }}, {{ location.city }}
          </p>
          <p class="body-text">
            <NuxtLink :to="`/locatii/${location.slug}`" class="link">
              Vezi locația din {{ location.neighbourhood }} →
            </NuxtLink>
          </p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" data-reveal>
      <h2 class="block-title">Gata să faci parte din familia noastră?</h2>
      <p class="body-text measure-wide">
        Alege cursul potrivit pentru copilul tău și pornim împreună.
      </p>
      <div class="actions">
        <NuxtLink to="/cursuri" class="btn btn-primary">Explorează cursurile</NuxtLink>
        <NuxtLink to="/contact" class="btn btn-ghost">Contactează-ne</NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useReveal } from "~/composables/useReveal";
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { SCHOOL_LOCATIONS } from "#shared/school";
import { TEACHERS } from "#shared/teachers";
import { pageSeo } from "#shared/seo";
import { TESTIMONIALS } from "#shared/testimonials";
import { schoolGraph, breadcrumbNode, personNode, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";

definePageMeta({
  layout: "default",
  title: "Despre noi",
});

useReveal();

const [paul, ana] = TEACHERS as [(typeof TEACHERS)[0], (typeof TEACHERS)[0]];

// Practices, not virtues. "Excelență, Pasiune, Inovație" is what every
// competitor writes, and it tells a parent — or a model quoting the page —
// nothing at all.
const values = [
  {
    title: "Fiecare oră se termină cu ceva lucrat",
    body:
      "Copilul pleacă de la fiecare ședință cu ceva făcut de el — un desen digital la nivelurile " +
      "mici, un joc în Scratch la mijloc, o pagină web sau un program la cele mari. Nu cu notițe.",
  },
  {
    title: "Aceiași doi profesori, tot modulul",
    body:
      "Nu rotim instructori de la o ședință la alta. Cine începe modulul cu grupa îl și termină " +
      "cu ea.",
  },
  {
    title: "Programa merge până la examen",
    body:
      "C++, algoritmi și structuri de date sunt predate după programa pe care se dau olimpiada " +
      "și Bacalaureatul, nu într-o variantă simplificată.",
  },
];

const seo = pageSeo("/despre-noi");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  webPageNode(site, seo),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Despre noi", path: "/despre-noi" },
  ]),
  ...TEACHERS.map((teacher) => personNode(site, teacher)),
]);
</script>
