<template>
  <AdminPage title="Ștergere profil" width="md">
    <div class="text-center space-y-4">
      <UIcon name="i-lucide-alert-triangle" class="text-error text-5xl" />
      <h2 class="text-2xl font-bold text-error">ATENȚIE! Aceasta este o acțiune ireversibilă.</h2>
      <p class="text-muted">
        Dispare rândul familiei, cu datele ei de contact. Se poate șterge doar un profil care nu are
        nimic legat de el: dacă familia are copii înregistrați sau facturi emise, ștergerea este
        refuzată și îți spune care dintre ele stă în cale.
      </p>
      <p class="text-muted">
        Pentru o familie care a cerut ștergerea datelor, drumul este
        <NuxtLink to="/admin/stergeri" class="underline">Ștergeri</NuxtLink>: acolo pleacă și
        copiii, și lucrările lor, și mesajele, iar facturile rămân, fiindcă școala trebuie să le
        păstreze.
      </p>
    </div>
    <div class="flex items-center justify-center gap-3 flex-wrap">
      <UButton
        color="error"
        size="lg"
        variant="solid"
        class="min-h-11"
        :loading="deleting"
        @click="handleConfirmation"
      >
        Șterge profilul definitiv
      </UButton>
      <UButton
        color="neutral"
        size="lg"
        variant="outline"
        class="min-h-11"
        :to="`/admin/profiles/${$route.params.profileId}`"
      >
        Anulează și revino la profil
      </UButton>
    </div>
  </AdminPage>
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Confirmare Ștergere Profil",
});
const route = useRoute();
import { useProfileApi } from "~/composables/api/useProfileApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
const profileApi = useProfileApi();
const { success, error } = useNotifications();

const deleting = ref(false);

/**
 * Awaited, and only then reported.
 *
 * It used to call `deleteProfile` without `await`, announce "Profilul a fost șters cu succes."
 * through the *error* channel, and navigate away — so a refusal, a lost connection or a 500 all
 * looked exactly like a success, and the one thing the screen could not show was what went wrong.
 * The two refusals it can now hit (`PROFILE_HAS_INVOICES`, `PROFILE_HAS_CHILDREN`) are the whole
 * reason that matters: they are the normal answer, not the exception.
 */
const handleConfirmation = async () => {
  deleting.value = true;
  try {
    await profileApi.deleteProfile(route.params.profileId as string);
    success("Profilul a fost șters.");
    await navigateTo("/admin/profiles");
  } catch (err: unknown) {
    error("Profilul nu a fost șters", apiErrorMessage(err, "Nu am putut șterge profilul."));
  } finally {
    deleting.value = false;
  }
};
</script>
