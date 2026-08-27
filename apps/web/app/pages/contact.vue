<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <span class="kicker">Contact</span>
      <h1 class="page-title">Hai să stăm de vorbă</h1>
      <p class="lede">
        Sună la <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a> sau scrie la
        <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a
        >. Îți răspundem în cel mult 24 de ore, cu o recomandare de nivel dintre
        <NuxtLink to="/cursuri" class="link">cele șase</NuxtLink> și grupele cu locuri libere, la
        locația mai apropiată de tine.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-start" data-reveal>
      <div>
        <h2 class="block-title">Formular de contact</h2>

        <div v-if="sent" class="card card-lg card-accent" role="status">
          <p class="body-text">
            Mesajul a plecat. Îți răspundem în cel mult 24 de ore, la datele pe care ni le-ai lăsat.
          </p>
          <button type="button" class="btn btn-ghost" @click="composeAnother">
            Trimite încă un mesaj
          </button>
        </div>

        <form v-else class="form" novalidate @submit.prevent="onSubmit">
          <div v-if="errorMessage" class="card card-lg card-accent" role="alert">
            <p class="body-text">{{ errorMessage }}</p>
          </div>

          <div class="form-row">
            <div class="field">
              <label for="contact-name">Numele tău</label>
              <input
                id="contact-name"
                v-model="form.name"
                class="input"
                type="text"
                name="name"
                autocomplete="name"
                placeholder="ex. Maria Ionescu"
                :aria-invalid="Boolean(errors.name)"
                :aria-describedby="errors.name ? 'contact-name-error' : undefined"
              />
              <p v-if="errors.name" id="contact-name-error" class="field-error">
                {{ errors.name }}
              </p>
            </div>
            <div class="field">
              <label for="contact-reply">Telefon sau email</label>
              <input
                id="contact-reply"
                v-model="form.reply"
                class="input"
                type="text"
                name="reply"
                autocomplete="tel"
                placeholder="ex. 07xx xxx xxx"
                :aria-invalid="Boolean(errors.reply)"
                :aria-describedby="errors.reply ? 'contact-reply-error' : undefined"
              />
              <p v-if="errors.reply" id="contact-reply-error" class="field-error">
                {{ errors.reply }}
              </p>
            </div>
          </div>
          <div class="field">
            <label for="contact-subject">Subiect</label>
            <select
              id="contact-subject"
              v-model="form.subject"
              class="input"
              name="subject"
              :aria-invalid="Boolean(errors.subject)"
              :aria-describedby="errors.subject ? 'contact-subject-error' : undefined"
            >
              <option v-for="subject in CONTACT_SUBJECTS" :key="subject" :value="subject">
                {{ subject }}
              </option>
            </select>
            <p v-if="errors.subject" id="contact-subject-error" class="field-error">
              {{ errors.subject }}
            </p>
          </div>
          <div class="field">
            <label for="contact-message">Mesaj</label>
            <textarea
              id="contact-message"
              v-model="form.message"
              class="input"
              rows="5"
              name="message"
              placeholder="Vârsta copilului, experiența lui cu calculatorul și ce te-ar interesa…"
              :aria-invalid="Boolean(errors.message)"
              :aria-describedby="errors.message ? 'contact-message-error' : undefined"
            ></textarea>
            <p v-if="errors.message" id="contact-message-error" class="field-error">
              {{ errors.message }}
            </p>
          </div>

          <!--
            The honeypot. Hidden from sight and from the accessibility tree, and
            skipped by Tab, so nobody using the page can reach it; the bots that
            post to every form they find fill it in.
          -->
          <div class="honeypot" aria-hidden="true">
            <label :for="`contact-${HONEYPOT_FIELD}`">Nu completa acest câmp</label>
            <input
              :id="`contact-${HONEYPOT_FIELD}`"
              v-model="form[HONEYPOT_FIELD]"
              type="text"
              :name="HONEYPOT_FIELD"
              tabindex="-1"
              autocomplete="off"
            />
          </div>

          <div>
            <button type="submit" class="btn btn-primary" :disabled="loading">
              {{ loading ? "Se trimite…" : "Trimite mesajul" }}
            </button>
            <p class="note">
              Îți răspundem în cel mult 24 de ore. Dacă preferi, sună-ne sau scrie-ne direct la
              <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a
              >.
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
      <h2 class="kicker">Locațiile noastre</h2>
      <div class="cols-2">
        <div v-for="location in SCHOOL_LOCATIONS" :key="location.slug">
          <h3 class="sub-title">{{ location.neighbourhood }}</h3>
          <p class="body-text">
            {{ location.street }}, {{ location.district }}, {{ location.city }} ·
            <NuxtLink :to="`/locatii/${location.slug}`" class="link"
              >detalii despre locație</NuxtLink
            >
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { useReveal } from "~/composables/useReveal";
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { pageSeo } from "#shared/seo";
import { schoolGraph, breadcrumbNode, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";
import {
  SCHOOL_EMAIL,
  SCHOOL_HOURS,
  SCHOOL_LOCATIONS,
  SCHOOL_PHONE,
  SCHOOL_PHONE_HREF,
} from "#shared/school";
import {
  CONTACT_SUBJECTS,
  HONEYPOT_FIELD,
  contactMessageSchema,
  fieldErrorsOf,
  type ContactField,
} from "#shared/contact";

definePageMeta({
  layout: "default",
  title: "Contact",
});

useReveal();

/**
 * The same schema the server route validates against, so the two cannot drift
 * apart. This check exists to put the error under the field instead of after a
 * round trip — `/api/contact` re-validates everything it receives.
 */
const emptyForm = () => ({
  name: "",
  reply: "",
  subject: CONTACT_SUBJECTS[0] as string,
  message: "",
  [HONEYPOT_FIELD]: "",
});

const form = reactive(emptyForm());
const errors = reactive<Partial<Record<ContactField, string>>>({});
const loading = ref(false);
const sent = ref(false);
const errorMessage = ref<string | null>(null);

const clearErrors = () => {
  for (const field of Object.keys(errors) as ContactField[]) delete errors[field];
};

const composeAnother = () => {
  Object.assign(form, emptyForm());
  clearErrors();
  errorMessage.value = null;
  sent.value = false;
};

const onSubmit = async () => {
  if (loading.value) return;

  clearErrors();
  errorMessage.value = null;

  const result = contactMessageSchema.safeParse({ ...form });
  if (!result.success) {
    Object.assign(errors, fieldErrorsOf(result.error));
    return;
  }

  loading.value = true;
  try {
    // `$fetch` directly, not one of `composables/api/` — those wrap the NestJS
    // backend and carry the token refresh. This is our own Nitro route on the
    // same origin, public and unauthenticated; there is nothing to refresh.
    await $fetch("/api/contact", { method: "POST", body: result.data });
    sent.value = true;
  } catch (error) {
    // Nitro nests the payload one level deeper than it looks. The response body
    // is `{ statusCode, statusMessage, message, data }`, where `message` is the
    // English `statusMessage` h3 copies onto the error, and the `data` we passed
    // to `createError` is a sibling of it. ofetch then puts that whole body on
    // `error.data` — so the route's Romanian copy is at `error.data.data`.
    // Reading `error.data.message` gets "Contact form not configured" instead.
    // Only our own payload is ever Romanian; anything else falls back below.
    const payload = (
      error as { data?: { data?: { message?: string; fieldErrors?: typeof errors } } }
    )?.data?.data;
    if (payload?.fieldErrors) Object.assign(errors, payload.fieldErrors);
    errorMessage.value =
      payload?.message ??
      `Nu am putut trimite mesajul. Verifică-ți conexiunea sau scrie-ne la ${SCHOOL_EMAIL}.`;
  } finally {
    loading.value = false;
  }
};

const seo = pageSeo("/contact");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  { ...webPageNode(site, seo), "@type": "ContactPage" },
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Contact", path: "/contact" },
  ]),
]);
</script>
