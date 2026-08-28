<template>
  <div class="w-full max-w-4xl mx-auto px-4 py-6 space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Adaugă locație</h1>
        <p class="text-muted mt-1">
          O locație nouă se adaugă de aici, fără schimbări în cod. Sălile se adaugă după, din lista
          de locații.
        </p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="ml-auto flex items-center h-11"
        size="lg"
        to="/admin/locations"
      >
        <UIcon name="i-lucide-arrow-left" class="mr-2" />
        Înapoi
      </UButton>
    </div>

    <UCard class="hover:shadow-lg transition-shadow">
      <LocationForm submit-label="Creează" @submit="handleSubmit" />
    </UCard>
  </div>
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
