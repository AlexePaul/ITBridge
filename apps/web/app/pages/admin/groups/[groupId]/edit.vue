<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Editează Grup</h1>
        <p class="text-muted mt-1">Modifică detaliile grupului</p>
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
    <UCard v-if="group" class="hover:shadow-lg transition-shadow">
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

        <!-- Active Status -->
        <UFormField name="isActive">
          <template #label>Grup Activ<span class="text-error">*</span></template>
          <USelect v-model="state.isActive" :items="ACTIVE_ITEMS" class="w-full" />
        </UFormField>

        <!-- Actions -->
        <div class="flex gap-3 pt-6 border-t border-muted justify-center">
          <UButton type="submit" color="primary" variant="subtle" size="md" class="w-40">
            Salvează
          </UButton>
          <UButton color="primary" variant="outline" size="md" class="w-40" @click="handleBack">
            Anulare
          </UButton>
        </div>
      </UForm>
    </UCard>

    <!-- Loading State -->
    <UCard v-else class="hover:shadow-lg transition-shadow">
      <div class="flex justify-center items-center py-8">
        <UIcon name="i-lucide-loader" class="animate-spin mr-2" />
        <span>Se încarcă...</span>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { WEEKDAYS_IN_ORDER, WEEKDAY_LABELS } from "~/types/group.types";
import { apiErrorMessage } from "~/composables/useApiError";
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useNotifications } from "~/composables/useNotifications";
import { useGroupsStore } from "~/stores/groupsStore";
import type { Group } from "~/types/group.types";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useRoomsApi } from "~/composables/api/useRoomsApi";
import { useLocationStore } from "~/stores/locationStore";
import { formatTime } from "~/composables/useUtils";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Editează Grup",
});

const route = useRoute();
const { success, error } = useNotifications();
const groupsStore = useGroupsStore();
const groupsApi = useGroupsApi();

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

/** Same shape for the group's own on/off switch. */
const ACTIVE_ITEMS = [
  { value: true, label: "Activ" },
  { value: false, label: "Inactiv" },
];

const group: Ref<Group | null> = ref(null);

const locationStore = useLocationStore();
const locationsApi = useLocationsApi();
const roomsApi = useRoomsApi();

const schema = z.object({
  name: z.string().min(1, "Numele grupei este obligatoriu").max(120),
  roomId: z.number({ error: "Sala este obligatorie" }).min(1, "Sala este obligatorie"),
  weekday: z.number().min(1, "Ziua săptămânii este obligatorie"),
  startTime: z.string().min(1, "Ora de început este obligatorie"),
  endTime: z.string().min(1, "Ora de sfârșit este obligatorie"),
  capacity: z.number().min(1, "Numărul maxim de copii este obligatoriu"),
  minAge: z.number().min(1, "Vârsta minimă este obligatorie"),
  maxAge: z.number().min(1, "Vârsta maximă este obligatorie"),
  isActive: z.boolean(),
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
  isActive: true,
});

/**
 * The open rooms, plus whichever one this group is already in.
 *
 * A room that closed after the group was scheduled into it must stay in the list: dropping it
 * would leave the select showing nothing, and saving would then move the group somewhere nobody
 * asked for. The API allows the same thing — it only refuses a *move into* a closed room.
 */
const roomOptions = computed(() => {
  const current = group.value?.room;
  const rooms = locationStore.usableRooms.filter((room) => room.id !== current?.id);
  return [...(current ? [current] : []), ...rooms].map((room) => ({
    value: room.id,
    label: `${room.location.name} · ${room.name} (${room.capacity} locuri)${
      locationStore.isUsable(room) ? "" : " — inactivă"
    }`,
  }));
});

onMounted(async () => {
  const groupId = route.params.groupId as string;

  // The store is filled by the groups list; arriving straight on this URL has to fetch first,
  // otherwise the page reports "Grupul nu a fost găsit" for a group that exists.
  if (groupsStore.groups.length === 0) {
    try {
      await groupsApi.fetchGroups();
    } catch (err: unknown) {
      error(apiErrorMessage(err, "Eroare la încărcarea grupului"));
    }
  }
  try {
    if (locationStore.rooms.length === 0) {
      await Promise.all([locationsApi.fetchLocations(), roomsApi.fetchRooms()]);
    }
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la încărcarea sălilor"));
  }

  group.value = groupsStore.getGroupById(groupId) || null;

  if (group.value) {
    state.name = group.value.name;
    state.roomId = group.value.room?.id;
    state.weekday = group.value.weekday;
    state.startTime = formatTime(group.value.startTime);
    state.endTime = formatTime(group.value.endTime);
    state.capacity = Number(group.value.capacity);
    state.minAge = Number(group.value.minAge);
    state.maxAge = Number(group.value.maxAge);
    state.isActive = group.value.isActive ?? true;
  } else {
    error("Grupul nu a fost găsit");
    navigateTo("/admin/groups");
  }
});

const handleBack = () => {
  navigateTo("/admin/groups");
};

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const payload = {
      name: event.data.name,
      roomId: Number(event.data.roomId),
      weekday: Number(event.data.weekday),
      startTime: event.data.startTime,
      endTime: event.data.endTime,
      capacity: Number(event.data.capacity),
      minAge: Number(event.data.minAge),
      maxAge: Number(event.data.maxAge),
      isActive: event.data.isActive,
    };

    await groupsApi.updateGroup(route.params.groupId as string, payload);
    success("Grup actualizat cu succes");
    await navigateTo("/admin/groups");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la actualizarea grupului"));
  }
}
</script>
