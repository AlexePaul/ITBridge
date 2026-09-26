<template>
  <AdminPage title="Ștergere copil" width="md">
    <div class="text-center space-y-4">
      <UIcon name="i-lucide-alert-triangle" class="text-error text-5xl" />
      <h2 class="text-2xl font-bold text-error">ATENȚIE! Aceasta este o acțiune ireversibilă.</h2>
      <p class="text-muted">
        Se poate șterge doar un copil adăugat din greșeală: unul care are prezențe în catalog sau
        lucrări nu se șterge, fiindcă acelea sunt evidența a ce s-a întâmplat. Înscrierile lui
        pleacă odată cu el.
      </p>
    </div>
    <div class="flex items-center justify-center gap-3 flex-wrap">
      <UButton
        color="error"
        size="lg"
        variant="solid"
        class="min-h-11"
        :loading="busy"
        @click="handleConfirmation"
      >
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
import { apiErrorMessage } from "~/composables/useApiError";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Confirmare Ștergere Copil",
});

const route = useRoute();
const { success, error } = useNotifications();
const childrenApi = useChildrenApi();
const busy = ref(false);

/**
 * The refusal is the common answer here, not the exception: a child with register marks
 * (`CHILD_HAS_ATTENDANCE`) or work (`CHILD_HAS_PROJECTS`) is not deleted, and the page used to let
 * that 409 escape as an unhandled rejection — nothing on screen, the page just stayed (QA of
 * 26 September 2026).
 */
const handleConfirmation = async () => {
  if (busy.value) return;
  busy.value = true;
  try {
    await childrenApi.deleteChild(Number(route.params.childId));
    success("Copilul a fost șters cu succes");
    await navigateTo("/admin/children");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut șterge copilul."));
  } finally {
    busy.value = false;
  }
};
</script>
