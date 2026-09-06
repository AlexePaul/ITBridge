<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Adaugă Grup Nou</h1>
        <p class="text-muted mt-1">Completează detaliile pentru a crea un nou grup</p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="mr-3 ml-auto flex items-center h-11"
        size="lg"
        @click="handleBack"
      >
        <UIcon name="i-lucide-arrow-left" class="mr-2" />
        Înapoi
      </UButton>
    </div>

    <!-- Form Card -->
    <UCard class="hover:shadow-lg transition-shadow">
      <UForm :schema="schema" :state="state" class="space-y-6" @submit="handleSubmit">
        <!-- Name -->
        <UFormField name="name">
          <template #label>Numele grupei<span class="text-error">*</span></template>
          <UInput v-model="state.name" placeholder="Scratch Începători" icon="i-lucide-tag" />
        </UFormField>

        <!-- Room -->
        <UFormField name="roomId" help="Locația rezultă din sală.">
          <template #label>Sala<span class="text-error">*</span></template>
          <USelect v-model="state.roomId" :items="roomOptions" class="w-full" />
        </UFormField>

        <!-- Weekday -->
        <UFormField name="weekday">
          <template #label>Ziua săptămânii<span class="text-error">*</span></template>
          <USelect v-model="state.weekday" :items="dayOptions" class="w-full" />
        </UFormField>

        <!-- Time Range -->
        <div class="grid grid-cols-2 gap-6">
          <UFormField name="startTime">
            <template #label>Ora de început<span class="text-error">*</span></template>
            <UInput type="time" v-model="state.startTime" icon="i-lucide-clock" />
          </UFormField>
          <UFormField name="endTime">
            <template #label>Ora de sfârșit<span class="text-error">*</span></template>
            <UInput type="time" v-model="state.endTime" icon="i-lucide-clock" />
          </UFormField>
        </div>

        <!-- Capacity -->
        <UFormField name="capacity" help="Nu poate depăși numărul de locuri din sală.">
          <template #label>Număr maxim de copii<span class="text-error">*</span></template>
          <UInput type="number" v-model.number="state.capacity" icon="i-lucide-users-round" />
        </UFormField>

        <!-- Age Range -->
        <div class="grid grid-cols-2 gap-6">
          <UFormField name="minAge">
            <template #label>Vârsta minimă<span class="text-error">*</span></template>
            <UInput type="number" v-model="state.minAge" icon="i-lucide-users" />
          </UFormField>
          <UFormField name="maxAge">
            <template #label>Vârsta maximă<span class="text-error">*</span></template>
            <UInput type="number" v-model="state.maxAge" icon="i-lucide-users" />
          </UFormField>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-6 border-t border-muted justify-center">
          <UButton type="submit" color="primary" variant="subtle" size="md" class="w-40">
            Creează Grup
          </UButton>
          <UButton color="primary" variant="outline" size="md" class="w-40" @click="handleBack">
            Anulare
          </UButton>
        </div>
      </UForm>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { WEEKDAYS_IN_ORDER, WEEKDAY_LABELS } from "~/types/group.types";
import { apiErrorMessage } from "~/composables/useApiError";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useNotifications } from "~/composables/useNotifications";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useRoomsApi } from "~/composables/api/useRoomsApi";
import { useLocationStore } from "~/stores/locationStore";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Adaugă Grup Nou",
});

const { success, error } = useNotifications();

// Built from the shared enum, so the list cannot drift from what the API accepts. The two
// hand-written copies this replaces both stopped at Saturday, so a Sunday group could not be
// created from the UI at all.
/**
 * The weekdays, shaped for `USelect` — E18/S5b.
 *
 * The native `<select>` these replace carried `border-gray-300` in eight admin screens: a fixed
 * grey that does not follow the theme, so it stayed light in dark mode. `v-model.number` went with
 * it — `USelect` hands back the item's own value, which is already the ISO day number.
 */
const dayOptions = WEEKDAYS_IN_ORDER.map((id) => ({ value: id, label: WEEKDAY_LABELS[id] }));
const groupsApi = useGroupsApi();

const locationStore = useLocationStore();
const locationsApi = useLocationsApi();
const roomsApi = useRoomsApi();

const schema = z.object({
  name: z.string().min(1, "Numele grupei este obligatoriu").max(120),
  roomId: z.number({ error: "Sala este obligatorie" }).min(1, "Sala este obligatorie"),
  weekday: z.number().min(1, "Ziua săptămânii este obligatorie"),
  startTime: z.string().min(1, "Ora de începent este obligatorie"),
  endTime: z.string().min(1, "Ora de sfârșit este obligatorie"),
  capacity: z.number().min(1, "Numărul maxim de copii este obligatoriu"),
  minAge: z.number().min(1, "Vârsta minimă este obligatorie"),
  maxAge: z.number().min(1, "Vârsta maximă este obligatorie"),
});

type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  name: "",
  roomId: undefined,
  weekday: 1,
  startTime: "",
  endTime: "",
  capacity: undefined,
  minAge: undefined,
  maxAge: undefined,
});

// Every open room, each labelled with its address: a group is created *somewhere*, and "Sala 1"
// alone does not say where — both locations have one. Closed rooms are left out because the API
// refuses them (`ROOM_INACTIVE`), so offering one would only produce a form that fails on submit.
const roomOptions = computed(() =>
  locationStore.usableRooms.map((room) => ({
    value: room.id,
    label: `${room.location.name} · ${room.name} (${room.capacity} locuri)`,
  }))
);

onMounted(async () => {
  try {
    if (locationStore.rooms.length === 0) {
      await Promise.all([locationsApi.fetchLocations(), roomsApi.fetchRooms()]);
    }
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la încărcarea sălilor"));
  }
  // Preselect a room at whatever location the header is showing, so the common case is one click.
  const preferred =
    locationStore.roomsInSelection.find((room) => locationStore.isUsable(room)) ??
    locationStore.usableRooms[0];
  if (preferred) {
    state.roomId = preferred.id;
    state.capacity = preferred.capacity;
  }
});

// The API refuses a group larger than its room, so follow the room rather than let the admin
// submit a number that is going to be rejected.
watch(
  () => state.roomId,
  (roomId) => {
    const room = locationStore.rooms.find((item) => item.id === roomId);
    if (room && (state.capacity === undefined || state.capacity > room.capacity)) {
      state.capacity = room.capacity;
    }
  }
);

const handleBack = () => {
  navigateTo("/admin/groups");
};

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const payload = {
      name: event.data.name,
      roomId: event.data.roomId,
      weekday: event.data.weekday,
      startTime: event.data.startTime,
      endTime: event.data.endTime,
      capacity: event.data.capacity,
      minAge: event.data.minAge,
      maxAge: event.data.maxAge,
    };

    await groupsApi.createGroup(payload);
    success("Grup creat cu succes");
    await navigateTo("/admin/groups");
  } catch (err: unknown) {
    // The composable rethrows now, so this branch is reachable — it used to be dead, and a
    // rejected create still showed "Grup creat cu succes" and navigated away.
    error(apiErrorMessage(err, "Eroare la crearea grupului"));
  }
}
</script>
