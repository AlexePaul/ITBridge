<template>
  <div class="page">
    <section class="section-lead">
      <div class="setup-panel">
        <!--
          Two entries, one page, and neither pretends to be the other.

          Right after signing up there is genuinely a second step, and the progress shown is real:
          `ProfileSetup` is set because the account has no profile row at all. For a family the
          school entered from a phone call, there is no step 2 of anything — the account already
          exists and some of the details are already in it — so the page says what is actually true
          and shows no progress bar. Faking a wizard in the second case would count a step nobody
          took.
        -->
        <template v-if="isFirstTime">
          <span class="kicker">Pasul 2 din 2</span>
          <div class="steps" role="presentation">
            <span class="step step-done"></span>
            <span class="step"></span>
          </div>
          <h1 class="auth-title">Completează profilul</h1>
          <p class="body-text">
            Datele de contact și o persoană de urgență — școala are nevoie de ele înainte de prima
            oră a copilului.
          </p>
        </template>
        <template v-else>
          <h1 class="auth-title">{{ hasGaps ? "Ne lipsesc câteva detalii" : "Datele tale" }}</h1>
          <p class="body-text">
            {{
              hasGaps
                ? "O parte din date există deja. Mai avem nevoie doar de cele de mai jos."
                : "Schimbă ce nu mai e la zi. Pentru grupa unui copil, sună-ne — aia o facem noi."
            }}
          </p>
        </template>

        <form class="form setup-form" @submit.prevent="onSubmit">
          <div class="field-row">
            <div class="field">
              <label for="setup-last-name">Nume</label>
              <input
                id="setup-last-name"
                v-model="form.lastName"
                class="input"
                type="text"
                autocomplete="family-name"
              />
              <p v-if="errors.lastName" class="field-error">{{ errors.lastName }}</p>
            </div>
            <div class="field">
              <label for="setup-first-name">Prenume</label>
              <input
                id="setup-first-name"
                v-model="form.firstName"
                class="input"
                type="text"
                autocomplete="given-name"
              />
              <p v-if="errors.firstName" class="field-error">{{ errors.firstName }}</p>
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="setup-email">Email</label>
              <input
                id="setup-email"
                v-model="form.email"
                class="input"
                type="email"
                autocomplete="email"
              />
              <p v-if="errors.email" class="field-error">{{ errors.email }}</p>
            </div>
            <div class="field">
              <label for="setup-phone">Telefon</label>
              <input
                id="setup-phone"
                v-model="form.phone"
                class="input"
                type="tel"
                autocomplete="tel"
                placeholder="07xxxxxxxx"
              />
              <p v-if="errors.phone" class="field-error">{{ errors.phone }}</p>
            </div>
          </div>

          <div class="field">
            <label for="setup-address">Adresă</label>
            <input
              id="setup-address"
              v-model="form.address"
              class="input"
              type="text"
              autocomplete="street-address"
              placeholder="Strada, numărul, orașul"
            />
            <p class="field-hint">Apare pe factură.</p>
            <p v-if="errors.address" class="field-error">{{ errors.address }}</p>
          </div>

          <fieldset class="fieldset">
            <legend>Persoană de contact în caz de urgență</legend>
            <p class="field-hint">Pe cine sunăm dacă nu răspunzi tu în timpul orei.</p>

            <div class="field">
              <label for="setup-emergency-name">Nume</label>
              <input
                id="setup-emergency-name"
                v-model="form.emergencyContactName"
                class="input"
                type="text"
              />
              <p v-if="errors.emergencyContactName" class="field-error">
                {{ errors.emergencyContactName }}
              </p>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="setup-emergency-relation">Relația cu copilul</label>
                <input
                  id="setup-emergency-relation"
                  v-model="form.emergencyContactRelation"
                  class="input"
                  type="text"
                  placeholder="bunica, unchi…"
                />
                <p v-if="errors.emergencyContactRelation" class="field-error">
                  {{ errors.emergencyContactRelation }}
                </p>
              </div>
              <div class="field">
                <label for="setup-emergency-phone">Telefon</label>
                <input
                  id="setup-emergency-phone"
                  v-model="form.emergencyContactPhone"
                  class="input"
                  type="tel"
                  placeholder="07xxxxxxxx"
                />
                <p v-if="errors.emergencyContactPhone" class="field-error">
                  {{ errors.emergencyContactPhone }}
                </p>
              </div>
            </div>
          </fieldset>

          <p class="field-hint">Toate câmpurile sunt obligatorii.</p>

          <button type="submit" class="btn btn-primary btn-block" :disabled="saving">
            {{ saving ? "Se salvează…" : "Salvează" }}
          </button>
        </form>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watchEffect } from "vue";
import * as z from "zod";
import { useProfileApi } from "~/composables/api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";
import { useProfileInitialization } from "~/composables/useProfileInitialization";
import { useNotifications } from "~/composables/useNotifications";
import { isRomanianPhone, normalizePhone } from "~/composables/useUtils";
import { apiErrorCode, apiErrorMessage } from "~/composables/useApiError";
import type { Profile } from "~/types/profile.types";

/**
 * Completează profilul — E18/S4, screen 6b.
 *
 * **One page, two entries, and the difference between them is not cosmetic.**
 *
 * - *Right after signing up*: there is no profile row, `ProfileSetup` is set, and the middleware has
 *   brought the parent here. "Pasul 2 din 2" is then a true statement about a real second step, and
 *   the progress shown is honest.
 * - *A family the school entered from a phone call*: the profile already exists, half filled in, and
 *   nobody is mid-flow. There is no step 2 of anything to show, so the page says "ne lipsesc câteva
 *   detalii" and shows no progress. It is also reachable from Profil, as plain editing.
 *
 * Which one it is is read off the data — not off a query parameter, so the page cannot be linked
 * into the wrong story. **What it reads changed with E11/S2**: the test was "is there a profile row
 * at all", and `register` now writes a shell one in the same transaction as the account, so that
 * test is false for every parent who has just signed up — exactly the reader "Pasul 2 din 2" is
 * addressed to. The honest signal is instead whether the row holds anything beyond what `register`
 * itself put there: a shell has a name and an email and nothing else, while the family the school
 * entered from a phone call arrives with at least one of the fields below already filled.
 *
 * The request differs accordingly: `POST /profiles` creates, `PUT /profiles/:id` merges. After the
 * split the second is the normal path and the first is a fallback for an account created outside
 * `register`; the merge still matters for the phone-entered family, whose row must not be replaced
 * by whatever this form holds.
 */
definePageMeta({
  layout: "portal" as any,
  title: "Completează profilul",
});

const profileApi = useProfileApi();
const profileStore = useProfileStore();
const userStore = useUserStore();
const { initializeProfile } = useProfileInitialization();
const { success, error } = useNotifications();

const saving = ref(false);

const profile = computed(() => profileStore.profile);
const isFirstTime = computed(() => {
  const p = profile.value;
  if (!p) return true;
  return !p.phone && !p.address && !p.emergencyContactName && !p.emergencyContactPhone;
});

/** Whether anything the school actually needs is still missing. Decides the wording, nothing else. */
const hasGaps = computed(() => {
  const p = profile.value;
  if (!p) return true;
  return !p.phone || !p.address || !p.emergencyContactName || !p.emergencyContactPhone;
});

const form = reactive({
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  emergencyContactName: "",
  emergencyContactRelation: "",
  emergencyContactPhone: "",
});

/**
 * Prefilled from whatever is already known.
 *
 * `watchEffect` rather than a one-shot read: the profile may still be in flight when this page
 * mounts, and a form that stayed empty would invite a parent to retype details the school already
 * has — and then reject them as duplicates of their own.
 */
watchEffect(() => {
  const p = profile.value;
  if (!p) return;
  form.firstName ||= p.firstName ?? "";
  form.lastName ||= p.lastName ?? "";
  form.email ||= p.email ?? "";
  form.phone ||= p.phone ?? "";
  form.address ||= p.address ?? "";
  form.emergencyContactName ||= p.emergencyContactName ?? "";
  form.emergencyContactRelation ||= p.emergencyContactRelation ?? "";
  form.emergencyContactPhone ||= p.emergencyContactPhone ?? "";
});

/**
 * Checked here as well as on the server, so the message appears under the field rather than in a
 * banner. The server stays the authority; this only decides whether the request is worth making.
 */
const schema = z.object({
  firstName: z.string().trim().min(1, "Prenumele este obligatoriu").max(100),
  lastName: z.string().trim().min(1, "Numele este obligatoriu").max(100),
  email: z
    .string()
    .trim()
    .min(1, "Adresa de email este obligatorie")
    .email("Adresa de email nu pare validă"),
  phone: z
    .string()
    .trim()
    .min(1, "Telefonul este obligatoriu")
    .refine(isRomanianPhone, "Scrie un număr de telefon românesc, de forma 07xxxxxxxx"),
  address: z.string().trim().min(1, "Adresa este obligatorie").max(255),
  emergencyContactName: z
    .string()
    .trim()
    .min(1, "Numele persoanei de contact este obligatoriu")
    .max(200),
  emergencyContactRelation: z.string().trim().min(1, "Spune-ne ce relație are cu copilul").max(100),
  emergencyContactPhone: z
    .string()
    .trim()
    .min(1, "Telefonul persoanei de contact este obligatoriu")
    .refine(isRomanianPhone, "Scrie un număr de telefon românesc, de forma 07xxxxxxxx"),
});

type FieldName = keyof z.infer<typeof schema>;

const errors = reactive<Partial<Record<FieldName, string>>>({});

const onSubmit = async () => {
  for (const key of Object.keys(errors) as FieldName[]) errors[key] = undefined;

  const result = schema.safeParse(form);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as FieldName;
      errors[field] ??= issue.message;
    }
    return;
  }

  const data = result.data;
  const payload: Partial<Profile> = {
    ...data,
    // Normalised to `+40…` before it leaves, so the duplicate check compares one spelling.
    phone: normalizePhone(data.phone),
    emergencyContactPhone: normalizePhone(data.emergencyContactPhone),
  };

  saving.value = true;
  try {
    const current = profile.value;
    if (current) {
      await profileApi.updateProfile(payload, current.id);
    } else {
      await profileApi.createProfile(payload);
    }
    // Re-read the gate before leaving — E11/S2. `ProfileSetup` is derived from the server's
    // `profileComplete`, and the middleware sends anybody it is still true for straight back here;
    // saving and navigating without refreshing it lands the parent on this page again, with the
    // form full and nothing left to do. The user has to be refetched too: the flag is computed
    // from `/auth/me`, not from the profile row this request just wrote.
    await userStore.fetchUser();
    await initializeProfile();
    success("Am salvat datele.");
    await navigateTo("/user/profile");
  } catch (err) {
    if (apiErrorCode(err) === "ALREADY_EXISTS" || apiErrorCode(err) === "CONFLICT") {
      error("Emailul sau numărul de telefon există deja în sistem.");
      return;
    }
    error(apiErrorMessage(err, "Nu am putut salva profilul. Încearcă din nou."));
  } finally {
    saving.value = false;
  }
};
</script>

<style scoped>
.setup-panel {
  width: min(520px, 100%);
  margin: 0 auto;
}

/* Two segments, the first filled: the progress a real second step has. Presentational — the
   "Pasul 2 din 2" above it is what a screen reader announces. */
.steps {
  display: flex;
  gap: 6px;
  max-width: 220px;
  margin: var(--space-3) 0 var(--rhythm-2);
}

.step {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--color-accent);
  opacity: 0.45;
}

.step-done {
  opacity: 1;
}

.setup-form {
  max-width: none;
  margin-top: var(--rhythm-2);
}
</style>
