<template>
  <UApp :locale="ro" :toaster="{ label: 'Notificare' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
<script setup lang="ts">
import { ro } from "@nuxt/ui/locale";

/**
 * Nuxt UI's own strings, in Romanian.
 *
 * Everything a component renders for itself — the sidebar toggle's label, "No data" under an
 * empty table, a modal's close button — comes from this locale, and the default is English. The
 * convention says only code is English; anything a parent or a teacher reads is Romanian, and a
 * label nobody wrote is still a label somebody reads. It mattered first on the phone: the one
 * control that opens the menu announced itself as "Open sidebar" to a teacher standing in a room.
 *
 * The toaster's label is not in the locale: a screen reader announced every toast as
 * "Notification" until it was set here (QA of 27 September 2026). Every screen's toasts go through
 * this toaster, by way of `useNotifications`.
 */
</script>
