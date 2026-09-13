<template>
  <UApp :locale="ro">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <NotificationContainer />
  </UApp>
</template>
<script setup lang="ts">
import { ro } from "@nuxt/ui/locale";

/**
 * Nuxt UI's own strings, in Romanian — the same line release/stage carries.
 *
 * Nothing on the public pages renders a component that emits a built-in
 * string today, so the seven pages are byte-identical with or without it.
 * It is here so the next component that does — a select in a form, a table
 * with no rows — cannot put "Show popup" or "No data" on a page that is
 * otherwise in Romanian, and so the two branches say the same thing.
 */
</script>
