<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Despre noi</span>
      <h1 class="page-title">Transformăm copiii în creatori de tehnologie.</h1>
      <p class="lede justified">
        IT Bridge School este o școală de informatică pentru copii, cu două locații în București.
        Credem că fiecare copil merită șansa de a-și atinge potențialul în IT — și că învățarea
        merge cel mai bine prin practică: proiecte reale, grupe mici și profesori care ajung la
        fiecare elev.
      </p>
    </section>

    <hr class="rule" />

    <section class="section">
      <span class="kicker">Echipa</span>

      <div class="split split-reverse split-start section" data-reveal>
        <figure class="plate portrait plate-md">
          <img src="/images/paul.jpg" alt="Alexe Vasile Paul" />
        </figure>
        <div>
          <h2 class="section-title">Alexe Vasile Paul</h2>
          <p class="label-accent">Profesor · Programare și algoritmi</p>
          <p class="body-text justified">
            Licențiat în Informatică la Universitatea din București, cu lucrarea de licență despre
            folosirea tehnologiei în educație. A predat informatică la nivel universitar ca asistent
            și lucrează ca programator backend — așa că exemplele de la ore vin direct din lumea
            reală a IT-ului.
          </p>
          <div class="stack">
            <div v-for="item in paulHighlights" :key="item" class="marked">
              <UIcon name="i-lucide-arrow-right" class="marker size-4" />
              <span class="body-text">{{ item }}</span>
            </div>
          </div>
        </div>
      </div>

      <hr class="rule" />

      <div class="split split-start section" data-reveal>
        <div>
          <h2 class="section-title">Alexe Ana Iulia</h2>
          <p class="label-accent">Profesoară · Competențe digitale și creativitate</p>
          <p class="body-text justified">
            Absolventă a Facultății de Economie Teoretică și Aplicată, cu o pasiune pentru educație
            și pentru tehnologie ca instrument de învățare. Predă Office, Canva, Tinkercad și
            Scratch — cu răbdare, empatie și adaptare la ritmul fiecărui copil.
          </p>
          <div class="stack">
            <div v-for="item in anaHighlights" :key="item" class="marked">
              <UIcon name="i-lucide-arrow-right" class="marker size-4" />
              <span class="body-text">{{ item }}</span>
            </div>
          </div>
        </div>
        <figure class="plate portrait plate-md self-end">
          <img src="/images/ana.jpg" alt="Alexe Ana Iulia" />
        </figure>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" data-reveal>
      <span class="kicker">Valorile noastre</span>
      <div class="cols-3 cols-ruled">
        <div v-for="value in values" :key="value.title">
          <h2 class="block-title">{{ value.title }}</h2>
          <p class="body-text justified">{{ value.body }}</p>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section" aria-label="Locațiile noastre" data-reveal>
      <span class="kicker">Locațiile noastre</span>
      <div class="cols-2">
        <div v-for="location in SCHOOL_LOCATIONS" :key="location.name" class="card card-lg">
          <p class="sub-title">{{ location.name }}</p>
          <p class="body-text">
            {{ location.address }}
            <template v-if="location.city"><br />{{ location.city }}</template>
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
        <NuxtLink to="/courses" class="btn btn-primary">Explorează cursurile</NuxtLink>
        <NuxtLink to="/contact" class="btn btn-ghost">Contactează-ne</NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useReveal } from "~/composables/useReveal";
import { SCHOOL_LOCATIONS } from "~/constants/school";

definePageMeta({
  layout: "default" as any,
  title: "Despre noi",
});

useReveal();

const paulHighlights = [
  "Bacalaureat promovat cu nota 10 la informatică",
  "Admis la Universitatea din București pe baza rezultatelor la olimpiadele școlare",
  "Experiență de predare la nivel universitar, ca asistent",
  "Programator backend activ — exemple concrete din industria IT, la fiecare curs",
];

const anaHighlights = [
  "Microsoft Office la nivel avansat — materiale educaționale interactive",
  "Canva, Tinkercad și Scratch — creativitate, modelare 3D și bazele programării vizuale",
  "Explicarea conceptelor tehnice simplu și prietenos",
  "Un mediu de învățare sigur, interactiv și motivant",
];

const values = [
  {
    title: "Excelență",
    body:
      "Educație de cea mai bună calitate, cu instructori experimentați și resurse mereu " +
      "actualizate.",
  },
  {
    title: "Pasiune",
    body:
      "Ne place ceea ce facem — și ne place și mai mult să transmitem această pasiune copiilor pe " +
      "care îi pregătim.",
  },
  {
    title: "Inovație",
    body:
      "Ne îmbogățim constant metodologia cu tehnologii și instrumente noi, ca orele să rămână " +
      "captivante.",
  },
];
</script>
