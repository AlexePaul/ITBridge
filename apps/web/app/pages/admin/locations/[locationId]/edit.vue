<template>
  <div class="w-full max-w-4xl mx-auto px-4 py-6 space-y-8">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Editează locația</h1>
        <p class="text-muted mt-1">Adresa se schimbă aici, într-un singur loc.</p>
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

    <UCard v-if="location" class="hover:shadow-lg transition-shadow">
      <LocationForm :initial="location" submit-label="Salvează" @submit="handleSubmit" />
    </UCard>

    <UCard v-else>
      <div class="flex justify-center items-center py-8">
        <UIcon name="i-lucide-loader" class="animate-spin mr-2" />
        <span>Se încarcă...</span>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useNotifications } from "~/composables/useNotifications";
import { useLocationStore } from "~/stores/locationStore";
import type { Location } from "~/types/location.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Editează locația",
});

const route = useRoute();
const { success, error } = useNotifications();
const locationStore = useLocationStore();
const locationsApi = useLocationsApi();

const locationId = Number(route.params.locationId);
const location = ref<Location | null>(null);

onMounted(async () => {
  // The store is usually already filled by the dashboard layout, but a hard load straight onto
  // this URL arrives before that finishes — so fetch rather than assume.
  if (locationStore.locations.length === 0) {
    try {
      await locationsApi.fetchLocations();
    } catch (err: unknown) {
      error(apiErrorMessage(err, "Eroare la încărcarea locației"));
    }
  }
  const found = locationStore.locations.find((item) => item.id === locationId);
  if (!found) {
    error("Locația nu a fost găsită");
    await navigateTo("/admin/locations");
    return;
  }
  location.value = found as Location;
});

async function handleSubmit(payload: Record<string, unknown>) {
  try {
    await locationsApi.updateLocation(locationId, payload);
    success("Locație actualizată");
    await navigateTo("/admin/locations");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la actualizarea locației"));
  }
}
</script>
