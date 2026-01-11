<template class="mt-12">
  <div class="flex justify-center">
    <UIcon name="i-lucide-alert-triangle" class="text-error text-5xl" />
  </div>
  <h1 class="text-2xl font-bold text-error text-center">
    ATENTIE! ACEASTA ESTE O ACȚIUNE IREVERSIBILĂ!
  </h1>
  <div class="mt-6 flex items-center justify-center gap-3 flex-wrap mx-auto">
    <UButton color="error" size="lg" variant="solid" @click="handleConfirmation">
      Șterge Profilul Definitiv
    </UButton>
    <UButton
      color="neutral"
      size="lg"
      variant="outline"
      @click="$router.push(`/admin/profiles/${$route.params.profileId}`)"
    >
      Anulează și Revino la Profil
    </UButton>
  </div>
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
