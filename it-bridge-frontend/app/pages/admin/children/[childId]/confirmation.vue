<template class="mt-12">
  <div class="flex justify-center">
    <UIcon name="i-lucide-alert-triangle" class="text-error text-5xl" />
  </div>
  <h1 class="text-2xl font-bold text-error text-center">
    ATENTIE! ACEASTA ESTE O ACȚIUNE IREVERSIBILĂ!
  </h1>
  <div class="mt-6 flex items-center justify-center gap-3 flex-wrap mx-auto">
    <UButton color="error" size="lg" variant="solid" @click="handleConfirmation">
      Șterge Copilul Definitiv
    </UButton>
    <UButton color="neutral" size="lg" variant="outline" @click="$router.push(`/admin/children`)">
      Anulează și Revino la lista Copiilor
    </UButton>
  </div>
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
  const childId = route.params.childId as string;
  await childrenApi.deleteChild(childId);
  success("Copilul a fost șters cu succes");
  await navigateTo("/admin/children");
};
</script>
