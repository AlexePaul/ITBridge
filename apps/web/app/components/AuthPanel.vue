<template>
  <div class="page">
    <section class="section-lead" data-reveal>
      <div class="auth-panel">
        <div class="seg auth-seg">
          <NuxtLink to="/auth/login" class="seg-opt" :aria-current="isLogin ? 'page' : undefined">
            Autentificare
          </NuxtLink>
          <NuxtLink
            to="/auth/register"
            class="seg-opt"
            :aria-current="isLogin ? undefined : 'page'"
          >
            Înregistrare
          </NuxtLink>
        </div>

        <h1 class="auth-title">{{ copy.title }}</h1>
        <p class="body-text">{{ copy.subtitle }}</p>

        <div v-if="errorMessage" class="card card-lg card-accent" role="alert">
          <p class="body-text">{{ errorMessage }}</p>
        </div>

        <form class="form" @submit.prevent="onSubmit">
          <div class="field">
            <label for="auth-username">Utilizator</label>
            <input
              id="auth-username"
              v-model="form.username"
              class="input"
              type="text"
              autocomplete="username"
              placeholder="Numele tău de utilizator"
            />
            <p v-if="errors.username" class="field-error">{{ errors.username }}</p>
          </div>
          <div class="field">
            <label for="auth-password">Parolă</label>
            <input
              id="auth-password"
              v-model="form.password"
              class="input"
              type="password"
              :autocomplete="isLogin ? 'current-password' : 'new-password'"
              placeholder="Cel puțin 8 caractere"
            />
            <p v-if="errors.password" class="field-error">{{ errors.password }}</p>
          </div>

          <!--
            Everything below only exists on the register form. E11/S2 made these fields required at
            registration, because the school could otherwise end up with a family it has no way to
            invoice, call, or reach in an emergency — and nothing would say so until it mattered.
          -->
          <template v-if="!isLogin">
            <div class="field-row">
              <div class="field">
                <label for="auth-first-name">Prenume</label>
                <input
                  id="auth-first-name"
                  v-model="form.firstName"
                  class="input"
                  type="text"
                  autocomplete="given-name"
                  placeholder="Prenumele tău"
                />
                <p v-if="errors.firstName" class="field-error">{{ errors.firstName }}</p>
              </div>
              <div class="field">
                <label for="auth-last-name">Nume</label>
                <input
                  id="auth-last-name"
                  v-model="form.lastName"
                  class="input"
                  type="text"
                  autocomplete="family-name"
                  placeholder="Numele tău de familie"
                />
                <p v-if="errors.lastName" class="field-error">{{ errors.lastName }}</p>
              </div>
            </div>

            <div class="field">
              <label for="auth-email">Email</label>
              <input
                id="auth-email"
                v-model="form.email"
                class="input"
                type="email"
                autocomplete="email"
                placeholder="adresa@exemplu.ro"
              />
              <p class="field-hint">Îți trimitem un link de confirmare pe această adresă.</p>
              <p v-if="errors.email" class="field-error">{{ errors.email }}</p>
            </div>

            <!-- Phone, address and the emergency contact moved to `/user/profile-setup`, which the
                 parent reaches immediately after this form and cannot skip (E11/S2, revised). Ten
                 mandatory fields as a first screen is a barrier at exactly the point E20 spends an
                 epic lowering one; the data is still required, just not all at once. -->
            <p class="colophon">
              După ce creezi contul îți mai cerem câteva date — telefon, adresă și un contact de
              urgență. Contul se activează în doi pași: confirmi adresa de email, apoi îl aprobăm
              noi. Înscrierea copilului într-o grupă o facem tot noi, după ce vorbim.
            </p>
          </template>

          <label class="checkbox">
            <input v-model="form.remember" type="checkbox" />
            Ține-mă minte
          </label>
          <button type="submit" class="btn btn-primary btn-block" :disabled="loading">
            {{ loading ? "Se procesează…" : copy.cta }}
          </button>
        </form>

        <hr class="rule" />
        <p class="colophon">
          {{ copy.switchHint }}
          <NuxtLink :to="isLogin ? '/auth/register' : '/auth/login'" class="link">
            {{ copy.switchLabel }}
          </NuxtLink>
        </p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from "vue";
import * as z from "zod";
import { useReveal } from "~/composables/useReveal";

const props = defineProps<{
  mode: "login" | "register";
  loading?: boolean;
  errorMessage?: string | null;
}>();

export interface LoginSubmitPayload {
  username: string;
  password: string;
  remember: boolean;
}

/**
 * What an account needs to exist, on top of the credentials. Mirrors `RegisterDto`.
 *
 * Phone, address and the emergency contact are not here: they are step two, on
 * `/user/profile-setup`, and just as required there (E11/S2, revised).
 */
export interface RegisterSubmitPayload extends LoginSubmitPayload {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Two events rather than one `submit` carrying optional fields.
 *
 * One event would have to type the eight registration fields as optional, and each page would then
 * be handed a payload whose shape does not match the form it rendered — the login page would see
 * fields it cannot receive, and the register page would have to assert away `undefined` on fields
 * its own schema has already made required.
 */
const emit = defineEmits<{
  login: [payload: LoginSubmitPayload];
  register: [payload: RegisterSubmitPayload];
}>();

useReveal();

const isLogin = computed(() => props.mode === "login");

const copy = computed(() =>
  isLogin.value
    ? {
        title: "Bine ai revenit",
        subtitle:
          "Introdu datele contului pentru a accesa profilul copiilor, facturile și prezența.",
        cta: "Autentifică-te",
        switchHint: "Nu ai încă un cont?",
        switchLabel: "Înregistrează-te",
      }
    : {
        title: "Creează un cont",
        subtitle: "Contul îți dă acces la profilul copiilor, facturi și prezență.",
        cta: "Creează contul",
        switchHint: "Ai deja un cont?",
        switchLabel: "Autentifică-te",
      }
);

const credentials = z.object({
  username: z
    .string("Numele de utilizator este obligatoriu")
    .min(1, "Numele de utilizator este obligatoriu"),
  password: z.string("Parola este obligatorie").min(8, "Trebuie să aibă cel puțin 8 caractere"),
});

/**
 * The register form's own fields, mirroring `RegisterDto` (E11/S2).
 *
 * Checked here as well as on the server, for the same reason the contact form is: the message
 * belongs under the field the reader can see, not in a banner at the top. The server stays the
 * authority — this only decides whether the request is worth making.
 */
const registration = credentials.extend({
  firstName: z.string().trim().min(1, "Prenumele este obligatoriu").max(100),
  lastName: z.string().trim().min(1, "Numele este obligatoriu").max(100),
  email: z
    .string()
    .trim()
    .min(1, "Adresa de email este obligatorie")
    .email("Adresa de email nu pare validă"),
});

type FieldName = keyof z.infer<typeof registration>;

const form = reactive({
  username: "",
  password: "",
  remember: false,
  firstName: "",
  lastName: "",
  email: "",
});

const errors = reactive<Partial<Record<FieldName, string>>>({});

const onSubmit = () => {
  for (const key of Object.keys(errors) as FieldName[]) {
    errors[key] = undefined;
  }

  const schema = isLogin.value ? credentials : registration;
  const result = schema.safeParse(form);

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0] as FieldName;
      errors[field] ??= issue.message;
    }
    return;
  }

  if (isLogin.value) {
    emit("login", { ...(result.data as z.infer<typeof credentials>), remember: form.remember });
    return;
  }

  const data = result.data as z.infer<typeof registration>;
  emit("register", { ...data, remember: form.remember });
};
</script>
