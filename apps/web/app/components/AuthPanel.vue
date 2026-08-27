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

const emit = defineEmits<{
  submit: [payload: { username: string; password: string; remember: boolean }];
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

const schema = z.object({
  username: z
    .string("Numele de utilizator este obligatoriu")
    .min(1, "Numele de utilizator este obligatoriu"),
  password: z.string("Parola este obligatorie").min(8, "Trebuie să aibă cel puțin 8 caractere"),
});

const form = reactive({ username: "", password: "", remember: false });
const errors = reactive<{ username?: string; password?: string }>({});

const onSubmit = () => {
  const result = schema.safeParse({ username: form.username, password: form.password });

  errors.username = undefined;
  errors.password = undefined;

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === "username" || field === "password") {
        errors[field] ??= issue.message;
      }
    }
    return;
  }

  emit("submit", { ...result.data, remember: form.remember });
};
</script>
