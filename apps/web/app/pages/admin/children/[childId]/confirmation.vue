<template>
  <AdminPage title="Ștergere copil" width="md">
    <div class="text-center space-y-4">
      <UIcon name="i-lucide-alert-triangle" class="text-error text-5xl" />
      <h2 class="text-2xl font-bold text-error">ATENȚIE! Aceasta este o acțiune ireversibilă.</h2>
      <p class="text-muted">Copilul dispare din listă împreună cu prezențele și înscrierile lui.</p>
    </div>
    <div class="flex items-center justify-center gap-3 flex-wrap">
      <UButton color="error" size="lg" variant="solid" class="min-h-11" @click="handleConfirmation">
        Șterge copilul definitiv
      </UButton>
      <UButton color="neutral" size="lg" variant="outline" class="min-h-11" to="/admin/children">
        Anulează și revino la lista copiilor
      </UButton>
    </div>
  </AdminPage>
</template>
<script setup lang="ts">
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useNotifications } from "~/composables/useNotifications";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Confirmare Ștergere Copil",
});

const route = useRoute();
const { success } = useNotifications();
const childrenApi = useChildrenApi();

const handleConfirmation = async () => {
  const childId = Number(route.params.childId);
  await childrenApi.deleteChild(childId);
  success("Copilul a fost șters cu succes");
  await navigateTo("/admin/children");
};
</script>
