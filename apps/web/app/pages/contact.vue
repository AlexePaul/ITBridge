<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Contact</span>
      <h1 class="page-title">Hai să stăm de vorbă.</h1>
      <p class="lede">
        Scrie-ne câteva rânduri despre copilul tău și te contactăm în cel mult 24 de ore, cu o
        recomandare de nivel și grupele cu locuri libere.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-start" data-reveal>
      <div>
        <h2 class="block-title">Formular de contact</h2>
        <form class="form">
          <div class="form-row">
            <div class="field">
              <label for="contact-name">Numele tău</label>
              <input id="contact-name" class="input" type="text" placeholder="ex. Maria Ionescu" />
            </div>
            <div class="field">
              <label for="contact-reply">Telefon sau email</label>
              <input id="contact-reply" class="input" type="text" placeholder="ex. 07xx xxx xxx" />
            </div>
          </div>
          <div class="field">
            <label for="contact-subject">Subiect</label>
            <select id="contact-subject" class="input">
              <option v-for="subject in subjects" :key="subject">{{ subject }}</option>
            </select>
          </div>
          <div class="field">
            <label for="contact-message">Mesaj</label>
            <textarea
              id="contact-message"
              class="input"
              rows="5"
              placeholder="Vârsta copilului, experiența lui cu calculatorul și ce te-ar interesa…"
            ></textarea>
          </div>
          <div>
            <button type="button" class="btn btn-primary" disabled>În curând</button>
            <p class="note">
              Trimiterea din formular se activează în curând. Până atunci sună-ne sau scrie-ne pe
              email — răspundem la fel de repede.
            </p>
          </div>
        </form>
      </div>

      <div>
        <h2 class="block-title">Direct</h2>
        <div class="stack stack-wide">
          <div class="marked">
            <UIcon name="i-lucide-phone" class="marker size-4.5" />
            <div>
              <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a>
              <p class="note">Luni–vineri, 9:00–18:00</p>
            </div>
          </div>
          <div class="marked">
            <UIcon name="i-lucide-mail" class="marker size-4.5" />
            <div>
              <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a>
              <p class="note">Răspundem în cel mult 24 de ore</p>
            </div>
          </div>
          <div class="marked">
            <UIcon name="i-lucide-clock" class="marker size-4.5" />
            <div class="body-text tnum">
              <p v-for="hours in SCHOOL_HOURS" :key="hours">{{ hours }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <hr class="rule" />

    <section class="section-close" aria-label="Locații" data-reveal>
      <span class="kicker">Locațiile noastre</span>
      <div class="cols-2">
        <div v-for="location in SCHOOL_LOCATIONS" :key="location.name">
          <p class="sub-title">{{ location.name }}</p>
          <p class="body-text">
            {{ location.address }}<template v-if="location.city">, {{ location.city }}</template>
          </p>
          <div v-if="location.mapEmbedUrl" class="plate">
            <iframe
              :src="location.mapEmbedUrl"
              :title="`Hartă — ${location.name}`"
              width="100%"
              height="280"
              style="border: 0"
              loading="lazy"
              referrerpolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
          <div v-else class="map-placeholder">
            <p class="stat-label">Hartă — se adaugă după confirmarea adresei</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useReveal } from "~/composables/useReveal";
import {
  SCHOOL_EMAIL,
  SCHOOL_HOURS,
  SCHOOL_LOCATIONS,
  SCHOOL_PHONE,
  SCHOOL_PHONE_HREF,
} from "~/constants/school";

definePageMeta({
  layout: "default" as any,
  title: "Contact",
});

useReveal();

const subjects = [
  "Întrebare despre cursuri",
  "Înscriere",
  "Parteneriat",
  "Feedback",
  "Altele",
] as const;
</script>
