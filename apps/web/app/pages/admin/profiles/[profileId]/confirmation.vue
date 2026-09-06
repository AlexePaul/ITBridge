<template>
  <AdminPage title="Ștergere profil" width="md">
    <div class="text-center space-y-4">
      <UIcon name="i-lucide-alert-triangle" class="text-error text-5xl" />
      <h2 class="text-2xl font-bold text-error">ATENȚIE! Aceasta este o acțiune ireversibilă.</h2>
      <p class="text-muted">
        Profilul dispare împreună cu datele de contact ale familiei. Copiii, facturile și plățile
        legate de el nu se șterg odată cu profilul.
      </p>
    </div>
    <div class="flex items-center justify-center gap-3 flex-wrap">
      <UButton color="error" size="lg" variant="solid" class="min-h-11" @click="handleConfirmation">
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
const profileApi = useProfileApi();
const { error } = useNotifications();

const handleConfirmation = () => {
  const profileId = route.params.profileId as string;
  profileApi.deleteProfile(profileId);
  error("Profilul a fost șters cu succes.");
  navigateTo("/admin/profiles");
};
</script>
