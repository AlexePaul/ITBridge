<template>
  <USelectMenu
    v-model="selection"
    :items="items"
    value-key="value"
    label-key="label"
    icon="i-lucide-map-pin"
    size="md"
    class="min-w-56"
    :ui="{ base: 'w-full' }"
  />
</template>

<script setup lang="ts">
import { ALL_LOCATIONS, useLocationStore, type LocationSelection } from "~/stores/locationStore";

/**
 * The location filter that sits in the admin navbar.
 *
 * It writes to one store, and every admin list reads the selection from the same place, so a list
 * cannot end up honouring a different location than the header says. "Toate locațiile" is a real
 * option rather than the absence of a filter: mixing the two addresses is legitimate for an
 * overview, as long as the header admits it is happening.
 */
const locationStore = useLocationStore();

// A closed location stays in the list, marked, rather than disappearing: its groups and its
// attendance history are still there to look at, and a location that vanishes from the header the
// moment it is deactivated looks like data loss.
const items = computed(() => [
  { label: "Toate locațiile", value: ALL_LOCATIONS as LocationSelection },
  ...locationStore.locations.map((location) => ({
    label: location.isActive ? location.name : `${location.name} (inactivă)`,
    value: location.id as LocationSelection,
  })),
]);

const selection = computed({
  get: () => locationStore.selectedLocationId as LocationSelection,
  set: (value: LocationSelection) => locationStore.selectLocation(value),
});
</script>
