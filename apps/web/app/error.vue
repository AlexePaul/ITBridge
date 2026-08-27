<script setup lang="ts">
import { computed } from "vue";
import type { NuxtError } from "#app";
import { useHead, useSeoMeta } from "#imports";

const props = defineProps<{ error: NuxtError }>();

const statusCode = computed(() => props.error?.statusCode ?? 500);

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
      return "Am notat eroarea. Încearcă din nou peste câteva momente sau sună-ne.";
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
