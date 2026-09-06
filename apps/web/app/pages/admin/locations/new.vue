<template>
  <AdminPage
    title="Adaugă locație"
    subtitle="O locație nouă se adaugă de aici, fără schimbări în cod. Sălile se adaugă după, din lista de locații."
    back-to="/admin/locations"
  >
    <UCard class="hover:shadow-lg transition-shadow">
      <LocationForm submit-label="Creează" @submit="handleSubmit" />
    </UCard>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useNotifications } from "~/composables/useNotifications";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Adaugă locație",
});

const { success, error } = useNotifications();
const locationsApi = useLocationsApi();

async function handleSubmit(payload: Record<string, unknown>) {
  try {
    await locationsApi.createLocation(payload);
    success("Locație creată");
    await navigateTo("/admin/locations");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la crearea locației"));
  }
}
</script>
