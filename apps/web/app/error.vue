<script setup lang="ts">
import { computed } from "vue";
import type { NuxtError } from "#app";
import { useHead, useSeoMeta, useState } from "#imports";

const props = defineProps<{ error: NuxtError }>();

const statusCode = computed(() => props.error?.statusCode ?? 500);

/**
 * The code the error went under on `/admin/erori` — E06 S1. Set by the reporting plugin when an
 * error is what brought the reader here, or read from the API's answer when a failed request did.
 * Only then does the page say the error was noted: it used to say so to everybody, when nothing
 * noted anything.
 */
const reportedReference = useState<string | null>("errorReference", () => null);
const reference = computed(() => {
  if (statusCode.value < 500) return null;
  const fromApi = (props.error?.data as { requestId?: unknown } | undefined)?.requestId;
  return reportedReference.value ?? (typeof fromApi === "string" ? fromApi.slice(0, 8) : null);
});

const title = computed(() => {
  switch (statusCode.value) {
    case 404:
      return "Pagina nu a fost găsită";
    case 403:
      return "Acces interzis";
    case 401:
      return "Trebuie să te autentifici";
    default:
      return "Ceva n-a mers bine";
  }
});

const explanation = computed(() => {
  switch (statusCode.value) {
    case 404:
      return "Adresa asta nu există sau nu mai există. Poți porni de la pagina principală.";
    case 403:
      return "Contul tău nu are acces la această pagină.";
    case 401:
      return "Autentifică-te ca să vezi această pagină.";
    default:
      return reference.value
        ? `Am notat eroarea, cu codul ${reference.value}. Încearcă din nou peste câteva momente; dacă se repetă, sună-ne și spune codul.`
        : "Încearcă din nou peste câteva momente sau sună-ne.";
  }
});

useSeoMeta({ title: `${title.value} | IT Bridge School`, robots: "noindex, follow" });
useHead({ titleTemplate: null });

const handleError = () => clearError({ redirect: "/" });
</script>

<template>
  <NuxtLayout>
    <div class="page section-lead">
      <p class="kicker tnum">Eroare {{ statusCode }}</p>
      <h1 class="page-title">{{ title }}</h1>
      <p class="body-text measure-wide">{{ explanation }}</p>
      <div class="actions">
        <button type="button" class="btn btn-primary" @click="handleError">
          Mergi la pagina principală
        </button>
        <NuxtLink to="/cursuri" class="btn btn-ghost">Vezi cursurile</NuxtLink>
        <NuxtLink to="/contact" class="btn btn-ghost">Contact</NuxtLink>
      </div>
    </div>
  </NuxtLayout>
</template>
