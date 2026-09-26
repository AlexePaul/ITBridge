<template>
  <div class="page">
    <section class="section-lead" data-intro>
      <span class="kicker">Lecție de probă</span>
      <h1 class="page-title">Vino la o oră, gratuit</h1>
      <p class="lede">
        Alege o zi care vă convine și lasă-ne datele. Proba este gratuită, durează cât o oră
        obișnuită, iar după ea te sunăm să vedem cum i s-a părut. Nu trebuie cont și nu te înscrii
        la nimic.
      </p>
    </section>

    <hr class="rule" />

    <section class="section split split-start" data-reveal>
      <div>
        <!-- Booked -->
        <div
          v-if="booked"
          ref="resultCard"
          class="card card-lg card-accent"
          role="status"
          tabindex="-1"
        >
          <h2 class="block-title">Ne vedem atunci</h2>
          <p class="body-text">
            Am notat proba lui <strong>{{ form.childFirstName }}</strong
            >, {{ booked.date ? formatDate(booked.date) : "" }}, ora {{ hour(booked.startTime) }},
            la grupa {{ booked.groupName }} ({{ booked.locationName }}).
          </p>
          <p class="body-text">
            <!-- A family that left only a phone has no email to read (QA of 26 September 2026). -->
            <template v-if="form.parentEmail.trim()">Ți-am trimis detaliile pe email. </template>
            Dacă nu mai poți ajunge, sună-ne la
            <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a> — locul merge mai
            departe altui copil.
          </p>
        </div>

        <!-- Kept, because there was no seat -->
        <div
          v-else-if="kept"
          ref="resultCard"
          class="card card-lg card-accent"
          role="status"
          tabindex="-1"
        >
          <h2 class="block-title">Te contactăm noi</h2>
          <p v-if="noSuitableDay" class="body-text">
            Ți-am notat cererea. Te sunăm să găsim împreună o zi și o oră care ți se potrivesc.
          </p>
          <p v-else class="body-text">
            Chiar acum nu avem un loc liber la grupa potrivită, dar ți-am notat cererea. Te sunăm
            imediat ce se eliberează unul sau când deschidem o grupă nouă.
          </p>
          <p class="body-text">
            Dacă vrei să vorbim mai repede, sună la
            <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
            >.
          </p>
        </div>

        <form v-else class="form" novalidate @submit.prevent="onSubmit">
          <div
            v-if="errorMessage"
            ref="alertCard"
            class="card card-lg card-accent"
            role="alert"
            tabindex="-1"
          >
            <p class="body-text">{{ errorMessage }}</p>
          </div>

          <h2 class="block-title">1. Despre copil</h2>
          <div class="field-row">
            <div class="field">
              <label for="trial-child-first">Prenumele copilului</label>
              <input
                id="trial-child-first"
                v-model="form.childFirstName"
                class="input"
                type="text"
                autocomplete="off"
                placeholder="ex. Matei"
                :aria-invalid="Boolean(errors.childFirstName)"
                :aria-describedby="errors.childFirstName ? 'trial-child-first-error' : undefined"
              />
              <p v-if="errors.childFirstName" id="trial-child-first-error" class="field-error">
                {{ errors.childFirstName }}
              </p>
            </div>
            <div class="field">
              <label for="trial-child-last">Numele de familie</label>
              <input
                id="trial-child-last"
                v-model="form.childLastName"
                class="input"
                type="text"
                autocomplete="off"
                placeholder="ex. Popescu"
                :aria-invalid="Boolean(errors.childLastName)"
                :aria-describedby="errors.childLastName ? 'trial-child-last-error' : undefined"
              />
              <p v-if="errors.childLastName" id="trial-child-last-error" class="field-error">
                {{ errors.childLastName }}
              </p>
            </div>
          </div>

          <div class="field">
            <label for="trial-birth">Data nașterii</label>
            <input
              id="trial-birth"
              v-model="form.childBirthDate"
              class="input"
              type="date"
              :max="today"
              :aria-invalid="Boolean(errors.childBirthDate)"
              :aria-describedby="errors.childBirthDate ? 'trial-birth-error' : 'trial-birth-help'"
              @change="loadSlots"
            />
            <p id="trial-birth-help" class="field-hint">
              Din ea știm ce grupe i se potrivesc. Nu o folosim la nimic altceva.
            </p>
            <p v-if="errors.childBirthDate" id="trial-birth-error" class="field-error">
              {{ errors.childBirthDate }}
            </p>
          </div>

          <h2 class="block-title">2. Alege ora</h2>

          <p v-if="!form.childBirthDate" class="body-text">
            Completează data nașterii și îți arătăm orele libere.
          </p>

          <p v-else-if="loadingSlots" class="body-text" role="status">Căutăm orele libere…</p>

          <div v-else-if="slotsFailed" class="card card-lg" role="alert">
            <p class="body-text">
              Nu am putut încărca orele acum. Sună-ne la
              <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a> și programăm
              proba la telefon, sau lasă-ne datele mai jos și te contactăm noi.
            </p>
          </div>

          <div v-else-if="slots.length === 0" class="card card-lg" role="status">
            <p class="body-text">
              Chiar acum nu avem loc liber la nicio grupă potrivită pentru vârsta lui. Lasă-ne
              datele mai jos și te sunăm când se eliberează unul.
            </p>
          </div>

          <fieldset v-else class="fieldset">
            <legend class="sub-title">Ore disponibile</legend>
            <!-- A card, not a label: a label around the dates' own labels made a tap on the group's
                 title pick its first date, and gave that radio the whole card as its name. -->
            <div class="slot-list">
              <div v-for="slot in slots" :key="slot.groupId" class="slot">
                <span class="slot-head">
                  <span class="sub-title">{{ slot.groupName }}</span>
                  <span class="body-text"
                    >{{ WEEKDAY_NAMES[slot.weekday] }}, {{ hour(slot.startTime) }}–{{
                      hour(slot.endTime)
                    }}
                    · {{ slot.locationName }}</span
                  >
                </span>
                <span class="slot-dates">
                  <label v-for="session in slot.sessions" :key="session.id" class="slot-date">
                    <input
                      v-model="form.classSessionId"
                      type="radio"
                      name="classSessionId"
                      :value="session.id"
                      :aria-invalid="Boolean(errors.classSessionId)"
                      :aria-describedby="errors.classSessionId ? 'trial-slot-error' : undefined"
                      @change="noSuitableDay = false"
                    />
                    <span>{{ formatDate(session.date) }}</span>
                  </label>
                </span>
              </div>
            </div>
            <!--
              Sending with no date chosen used to answer "nu avem un loc liber" beside a list of
              free seats (QA of 26 September 2026). Choosing none is still possible — on purpose.
            -->
            <label class="slot-date">
              <input v-model="noSuitableDay" type="checkbox" @change="form.classSessionId = null" />
              <span>Nu mi se potrivește nicio zi — sunați-mă să găsim alta</span>
            </label>
            <p v-if="errors.classSessionId" id="trial-slot-error" class="field-error">
              {{ errors.classSessionId }}
            </p>
          </fieldset>

          <h2 class="block-title">3. Datele tale</h2>
          <div class="field">
            <label for="trial-parent">Numele tău</label>
            <input
              id="trial-parent"
              v-model="form.parentName"
              class="input"
              type="text"
              autocomplete="name"
              placeholder="ex. Ioana Popescu"
              :aria-invalid="Boolean(errors.parentName)"
              :aria-describedby="errors.parentName ? 'trial-parent-error' : undefined"
            />
            <p v-if="errors.parentName" id="trial-parent-error" class="field-error">
              {{ errors.parentName }}
            </p>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="trial-email">Email</label>
              <input
                id="trial-email"
                v-model="form.parentEmail"
                class="input"
                type="email"
                autocomplete="email"
                placeholder="ex. ioana@exemplu.ro"
                :aria-invalid="Boolean(errors.contact || errors.parentEmail)"
                :aria-describedby="
                  errors.parentEmail
                    ? 'trial-email-error'
                    : errors.contact
                      ? 'trial-contact-error'
                      : 'trial-contact-help'
                "
              />
              <p v-if="errors.parentEmail" id="trial-email-error" class="field-error">
                {{ errors.parentEmail }}
              </p>
            </div>
            <div class="field">
              <label for="trial-phone">Telefon</label>
              <input
                id="trial-phone"
                v-model="form.parentPhone"
                class="input"
                type="tel"
                autocomplete="tel"
                placeholder="ex. 07xx xxx xxx"
                :aria-invalid="Boolean(errors.contact || errors.parentPhone)"
                :aria-describedby="
                  errors.parentPhone
                    ? 'trial-phone-error'
                    : errors.contact
                      ? 'trial-contact-error'
                      : 'trial-contact-help'
                "
              />
              <p v-if="errors.parentPhone" id="trial-phone-error" class="field-error">
                {{ errors.parentPhone }}
              </p>
            </div>
          </div>
          <p id="trial-contact-help" class="field-hint">
            Ne ajunge unul dintre ele. Confirmarea pleacă pe email, dacă îl lași.
          </p>
          <p v-if="errors.contact" id="trial-contact-error" class="field-error">
            {{ errors.contact }}
          </p>

          <div class="field">
            <label for="trial-experience">A mai programat până acum? (opțional)</label>
            <textarea
              id="trial-experience"
              v-model="form.experience"
              class="input"
              rows="3"
              placeholder="ex. a făcut Scratch la școală, altfel nimic"
            ></textarea>
          </div>

          <div class="field">
            <label for="trial-channel">De unde ai auzit de noi? (opțional)</label>
            <select id="trial-channel" v-model="form.channel" class="input">
              <option value="">Preferi să nu spui</option>
              <option v-for="(label, value) in LEAD_CHANNEL_LABELS" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>

          <!--
            The field a person never sees. Browsers leave it empty; the crawlers that post to any
            form they find fill every input they can name. Unlike the contact form's, this one is
            checked in the page and never travels: the API validates with `forbidNonWhitelisted`, so
            an extra field would be a 400 rather than a silent discard. The real limiter behind this
            endpoint is the server's throttle, which the contact route never had.
          -->
          <div class="honeypot" aria-hidden="true">
            <label for="trial-website">Nu completa acest câmp</label>
            <input
              id="trial-website"
              v-model="honeypot"
              type="text"
              tabindex="-1"
              autocomplete="off"
            />
          </div>

          <div>
            <button type="submit" class="btn btn-primary" :disabled="loading">
              {{ loading ? "Se trimite…" : "Trimite cererea" }}
            </button>
            <p class="note">
              Nu creezi cont și nu te înscrii. Înscrierea o facem împreună, după probă. Datele din
              formular le folosim doar ca să ținem locul și să te contactăm — vezi
              <NuxtLink to="/confidentialitate" class="link">politica de confidențialitate</NuxtLink
              >.
            </p>
          </div>
        </form>
      </div>

      <aside>
        <h2 class="block-title">Cum decurge</h2>
        <ol class="steps">
          <li class="body-text">Alegi o oră din cele libere și ne lași datele.</li>
          <li class="body-text">Primești confirmarea pe email, cu ziua, ora și adresa.</li>
          <li class="body-text">
            Copilul vine la oră, cu grupa lui. Calculatoarele sunt ale noastre.
          </li>
          <li class="body-text">Te sunăm după, și decideți împreună dacă continuă.</li>
        </ol>

        <p class="body-text">
          Preferi telefonul? Sună la
          <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a> sau scrie la
          <a :href="`mailto:${SCHOOL_EMAIL}`" class="link">{{ SCHOOL_EMAIL }}</a
          >.
        </p>
      </aside>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref } from "vue";
import { useReveal } from "~/composables/useReveal";
import { useSeo } from "~/composables/useSeo";
import { useJsonLd } from "~/composables/useJsonLd";
import { pageSeo } from "#shared/seo";
import { schoolGraph, breadcrumbNode, webPageNode } from "#shared/structured-data";
import { useRuntimeConfig } from "#imports";
import { SCHOOL_EMAIL, SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";
import { useLeadsApi } from "~/composables/api/useLeadsApi";
import { dayKey, looksLikeEmail, looksLikePhone } from "~/composables/useUtils";
import { apiErrorBody, apiErrorMessage } from "~/composables/useApiError";
import { LEAD_CHANNEL_LABELS, WEEKDAY_NAMES } from "~/types/lead.types";
import type { LeadChannel, TrialSlot } from "~/types/lead.types";

/**
 * Booking a trial, without an account — E20/S2.
 *
 * The one public page that talks to the backend. Every other public page works with no `API_BASE`
 * at all, which is why the site is in production while the API is not deployed — so this page is
 * built to fail softly: the hours load **client-side only**, and when they cannot load, the form
 * still submits and the reader is given the phone number. A page that white-screened without an API
 * would take the school's main conversion path down with it.
 *
 * Nothing here creates an account, and no copy promises one. Enrolment is an admin's job by
 * decision (E20, „Înscrierea nu e self-service"), and the words on this page are where that decision
 * either holds or quietly breaks.
 */
definePageMeta({
  layout: "default",
  title: "Lecție de probă",
});

useReveal();

const seo = pageSeo("/proba");
useSeo(seo);

const site = String(useRuntimeConfig().public.siteUrl);
useJsonLd([
  ...schoolGraph(site),
  webPageNode(site, seo),
  breadcrumbNode(site, [
    { name: "Acasă", path: "/" },
    { name: "Lecție de probă", path: "/proba" },
  ]),
]);

const { fetchTrialSlots, bookTrial } = useLeadsApi();

const today = dayKey();

const emptyForm = () => ({
  childFirstName: "",
  childLastName: "",
  childBirthDate: "",
  parentName: "",
  parentEmail: "",
  parentPhone: "",
  experience: "",
  channel: "" as LeadChannel | "",
  classSessionId: null as number | null,
});

const form = reactive(emptyForm());
const honeypot = ref("");
const errors = reactive<Record<string, string>>({});
const slots = ref<TrialSlot[]>([]);
const loadingSlots = ref(false);
const slotsFailed = ref(false);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const alertCard = ref<HTMLElement | null>(null);
const booked = ref<{
  date: string;
  startTime: string;
  groupName: string;
  locationName: string;
} | null>(null);
const kept = ref(false);
/** The parent saw the free dates and said none fits: a request for a call, not a lack of seats. */
const noSuitableDay = ref(false);
const resultCard = ref<HTMLElement | null>(null);

/**
 * The form is replaced by the answer, and on a phone the answer landed some 870 px above the
 * screen, with focus on the page (QA of 26 September 2026). Focusing it brings it into view and
 * has it read out.
 */
const showResult = async () => {
  await nextTick();
  resultCard.value?.focus();
};

const hour = (time: string) => time.slice(0, 5);

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));

/**
 * The hours, fetched when the birth date changes.
 *
 * A failure is a state of its own rather than an error thrown at the reader: with no API reachable
 * the rest of the page still works, and the request becomes a lead the office rings back.
 */
const loadSlots = async () => {
  form.classSessionId = null;
  noSuitableDay.value = false;
  slots.value = [];
  slotsFailed.value = false;
  if (!form.childBirthDate) return;

  loadingSlots.value = true;
  try {
    slots.value = await fetchTrialSlots(form.childBirthDate);
  } catch {
    slotsFailed.value = true;
  } finally {
    loadingSlots.value = false;
  }
};

const clearErrors = () => {
  for (const key of Object.keys(errors)) delete errors[key];
};

const validate = (): boolean => {
  clearErrors();
  if (form.childFirstName.trim().length < 2) errors.childFirstName = "Scrie prenumele copilului";
  if (form.childLastName.trim().length < 2) errors.childLastName = "Scrie numele de familie";
  if (!form.childBirthDate) errors.childBirthDate = "Avem nevoie de data nașterii";
  if (form.parentName.trim().length < 2) errors.parentName = "Scrie-ne numele tău";
  if (!form.parentEmail.trim() && !form.parentPhone.trim())
    errors.contact = "Lasă un email sau un telefon, ca să te putem contacta";
  // The shape only, and loosely: the server has the last word, and a check here stricter than its
  // own would refuse a number it takes. What this catches is the typo, before a round trip.
  if (form.parentEmail.trim() && !looksLikeEmail(form.parentEmail))
    errors.parentEmail = "Adresa de email nu pare validă. Verific-o, sau lasă doar telefonul.";
  if (form.parentPhone.trim() && !looksLikePhone(form.parentPhone))
    errors.parentPhone = "Numărul de telefon nu pare valid. Verifică-l, sau lasă doar emailul.";
  if (slots.value.length > 0 && form.classSessionId === null && !noSuitableDay.value)
    errors.classSessionId =
      "Alege una din zilele de mai sus, sau bifează că nu ți se potrivește niciuna.";
  return Object.keys(errors).length === 0;
};

/** Same as the contact form: move the caret to the first field that failed, and read out why. */
const focusFirstError = async () => {
  await nextTick();
  document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
};

const SEND_FAILED =
  "Nu am putut trimite cererea. Încearcă din nou sau sună-ne — te programăm la telefon.";

const onSubmit = async () => {
  if (loading.value) return;
  errorMessage.value = null;

  if (!validate()) {
    await focusFirstError();
    return;
  }

  // Filled in means it was not a person. Answer exactly as a success would, and send nothing.
  if (honeypot.value.trim() !== "") {
    kept.value = true;
    await showResult();
    return;
  }

  loading.value = true;
  try {
    const result = await bookTrial({
      parentName: form.parentName.trim(),
      parentEmail: form.parentEmail.trim() || undefined,
      parentPhone: form.parentPhone.trim() || undefined,
      childFirstName: form.childFirstName.trim(),
      childLastName: form.childLastName.trim(),
      childBirthDate: form.childBirthDate,
      experience: form.experience.trim() || undefined,
      channel: form.channel || undefined,
      classSessionId: form.classSessionId ?? undefined,
    });

    if (result.status === "booked" && result.trial) {
      booked.value = result.trial;
      await showResult();
      return;
    }
    kept.value = true;
    await showResult();
  } catch (err) {
    // When the server answered, its sentence is the answer — every refusal a parent can cause on
    // this form is worded for them (`BookTrialDto`). It used to be swallowed: „Adresa de email nu
    // pare validă" came back and the page said „încearcă din nou sau sună-ne", which reads as the
    // school's failure and sends the family to the phone over a typo they could fix in a second.
    // With no answer at all — the network, the server down — there is nothing to fix, and the
    // phone is the way forward.
    errorMessage.value = apiErrorBody(err).code ? apiErrorMessage(err, SEND_FAILED) : SEND_FAILED;
    await nextTick();
    alertCard.value?.focus();
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
/*
  Two things the design system has no class for yet: the list of bookable hours, and the honeypot.
  Everything else on this page composes `classical.css` as it stands, per E18/S1 — no colour and no
  font size is written here.
*/
.steps {
  margin: 0 0 var(--rhythm-2);
  padding-left: var(--rhythm-1);
  display: grid;
  gap: var(--space-2);
}

.slot-list {
  display: grid;
  gap: var(--rhythm-1);
}

.slot {
  display: grid;
  gap: var(--space-2);
  padding: var(--rhythm-1);
  border: 1px solid var(--color-divider);
  border-radius: var(--radius-md);
}

.slot-head {
  display: grid;
  gap: 2px;
}

.slot-dates {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.slot-date {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

/*
  Off-screen rather than `display: none`: a hidden input is still an input to the crawlers this is
  for, while a person never reaches it — the wrapper is `aria-hidden` and the control is out of the
  tab order.
*/
.honeypot {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
