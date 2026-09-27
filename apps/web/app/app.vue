<template>
  <UApp :locale="ro" :toaster="{ label: 'Notificare' }">
    <UTheme :props="themeProps">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UTheme>
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

/**
 * Every form field checks itself as it is typed into, not only once it loses focus. Waiting for the
 * blur made the submit button move under the pointer: a message shown after a first press stayed
 * under the last field until the press on the button blurred it, the message went, the form grew
 * shorter, and the release landed off the button — nothing happened, and the third press saved
 * (QA of 27 September 2026). Typed into, a field clears its message before anybody reaches for the
 * button. A field that sets `eager-validation` itself wins.
 */
const themeProps = { formField: { eagerValidation: true } };
</script>
