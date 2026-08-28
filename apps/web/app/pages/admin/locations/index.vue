<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Locații și săli</h1>
        <p class="text-muted mt-1">
          Adresele școlii și sălile din fiecare. O grupă se ține într-o sală, iar locația rezultă
          din ea.
        </p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="ml-auto flex items-center h-11"
        size="lg"
        to="/admin/locations/new"
      >
        <UIcon name="i-lucide-plus" class="mr-2" />
        Adaugă locație
      </UButton>
    </div>

    <!-- Empty state -->
    <div
      v-if="locationStore.locations.length === 0"
      class="text-center py-12 border border-dashed border-muted rounded-lg"
    >
      <UIcon name="i-lucide-map-pin-off" class="mx-auto text-4xl text-muted mb-3" />
      <p class="text-muted">Nu există nicio locație încă.</p>
    </div>

    <!-- One card per location, with its rooms -->
    <div v-else class="space-y-6">
      <UCard v-for="location in locationStore.locations" :key="location.id">
        <template #header>
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-xl font-semibold">{{ location.name }}</h2>
                <UBadge v-if="!location.isActive" color="warning" variant="soft" size="sm">
                  Inactivă
                </UBadge>
              </div>
              <p class="text-muted text-sm mt-1">{{ formatAddress(location) }}</p>
              <p class="text-muted text-xs mt-1">/{{ location.slug }}</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <UButton
                color="primary"
                variant="soft"
                size="sm"
                :to="`/admin/locations/${location.id}/edit`"
              >
                Editare
              </UButton>
              <UButton
                color="error"
                variant="soft"
                size="sm"
                @click="handleDeleteLocation(location.id)"
              >
                Șterge
              </UButton>
            </div>
          </div>
        </template>

        <!-- Rooms -->
        <div class="space-y-3">
          <h3 class="text-sm font-semibold text-muted uppercase tracking-wide">Săli</h3>

          <p v-if="roomsOf(location.id).length === 0" class="text-muted text-sm">
            Nicio sală. O grupă nu poate fi creată la această locație până nu există una.
          </p>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="room in roomsOf(location.id)"
              :key="room.id"
              class="border border-muted rounded-lg p-3"
              :class="!room.isActive && 'opacity-60'"
            >
              <!-- Edit mode -->
              <form
                v-if="editing[room.id]"
                class="space-y-2"
                @submit.prevent="handleSaveRoom(room.id)"
              >
                <UFormField label="Nume" size="xs">
                  <UInput v-model="editing[room.id]!.name" size="sm" />
                </UFormField>
                <div class="grid grid-cols-2 gap-2">
                  <UFormField label="Locuri" size="xs">
                    <UInput
                      v-model.number="editing[room.id]!.capacity"
                      type="number"
                      min="1"
                      size="sm"
                    />
                  </UFormField>
                  <UFormField label="Calculatoare" size="xs">
                    <UInput
                      v-model.number="editing[room.id]!.computers"
                      type="number"
                      min="0"
                      size="sm"
                    />
                  </UFormField>
                </div>
                <UFormField label="Stare" size="xs">
                  <select
                    v-model="editing[room.id]!.isActive"
                    class="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                  >
                    <option :value="true">Activă</option>
                    <option :value="false">Inactivă</option>
                  </select>
                </UFormField>
                <div class="flex gap-2 pt-1">
                  <UButton type="submit" color="primary" variant="subtle" size="xs"
                    >Salvează</UButton
                  >
                  <UButton color="neutral" variant="ghost" size="xs" @click="stopEditing(room.id)">
                    Anulare
                  </UButton>
                </div>
              </form>

              <!-- Display mode -->
              <div v-else class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center gap-2">
                    <p class="font-medium">{{ room.name }}</p>
                    <UBadge v-if="!room.isActive" color="warning" variant="soft" size="sm">
                      Inactivă
                    </UBadge>
                  </div>
                  <p class="text-sm text-muted">
                    {{ room.capacity }} locuri · {{ room.computers }} calculatoare
                  </p>
                </div>
                <div class="flex gap-1 shrink-0">
                  <UButton
                    color="primary"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-pencil"
                    @click="startEditing(room)"
                  />
                  <UButton
                    color="error"
                    variant="ghost"
                    size="xs"
                    icon="i-lucide-trash-2"
                    @click="handleDeleteRoom(room.id)"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Inline add-room form -->
          <form
            class="flex flex-wrap items-end gap-3 pt-3 border-t border-muted"
            @submit.prevent="handleAddRoom(location.id)"
          >
            <UFormField label="Nume sală" class="w-40">
              <UInput v-model="newRoom[location.id]!.name" placeholder="Sala 1" />
            </UFormField>
            <UFormField label="Locuri" class="w-28">
              <UInput v-model.number="newRoom[location.id]!.capacity" type="number" min="1" />
            </UFormField>
            <UFormField label="Calculatoare" class="w-32">
              <UInput v-model.number="newRoom[location.id]!.computers" type="number" min="0" />
            </UFormField>
            <UButton type="submit" color="primary" variant="subtle" size="md">Adaugă sală</UButton>
          </form>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useRoomsApi } from "~/composables/api/useRoomsApi";
import { useNotifications } from "~/composables/useNotifications";
import { useLocationStore } from "~/stores/locationStore";
import type { Location } from "~/types/location.types";
import type { Room } from "~/types/room.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Locații și săli",
});

const { success, error } = useNotifications();
const locationStore = useLocationStore();
const locationsApi = useLocationsApi();
const roomsApi = useRoomsApi();

interface RoomDraft {
  name: string;
  capacity: number;
  computers: number;
}

interface RoomEdit extends RoomDraft {
  isActive: boolean;
}

// One draft per location, so typing into one card's form does not fill in another's.
const newRoom = reactive<Record<number, RoomDraft>>({});

// A room being edited, keyed by id. Absent means the card is in display mode — so opening two at
// once is fine, and cancelling one does not discard the other.
const editing = reactive<Record<number, RoomEdit | undefined>>({});

// Ten seats is the school's standard room, and the default the migration writes. It is a starting
// point, not a rule: this form is what makes it configurable per room.
const DEFAULT_CAPACITY = 10;

const blankRoom = (): RoomDraft => ({ name: "", capacity: DEFAULT_CAPACITY, computers: 0 });

const ensureDrafts = () => {
  for (const location of locationStore.locations) {
    if (!newRoom[location.id]) newRoom[location.id] = blankRoom();
  }
};

onMounted(async () => {
  try {
    await Promise.all([locationsApi.fetchLocations(), roomsApi.fetchRooms()]);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la încărcarea locațiilor"));
  }
  ensureDrafts();
});

watch(() => locationStore.locations.length, ensureDrafts);

const roomsOf = (locationId: number) =>
  locationStore.rooms.filter((room) => room.location.id === locationId);

/** "Strada Valea Oltului 73, Sector 6, București" — the parts that are actually filled in. */
const formatAddress = (location: Location) =>
  [location.street, location.district, location.city].filter(Boolean).join(", ");

const startEditing = (room: Room) => {
  editing[room.id] = {
    name: room.name,
    capacity: room.capacity,
    computers: room.computers,
    isActive: room.isActive,
  };
};

const stopEditing = (roomId: number) => {
  editing[roomId] = undefined;
};

async function handleSaveRoom(roomId: number) {
  const draft = editing[roomId];
  if (!draft) return;
  if (!draft.name.trim()) {
    error("Sala are nevoie de un nume");
    return;
  }
  try {
    await roomsApi.updateRoom(roomId, { ...draft, name: draft.name.trim() });
    stopEditing(roomId);
    success("Sală actualizată");
  } catch (err: unknown) {
    // Left in edit mode on purpose: a duplicate name or a capacity the API rejects is something
    // to correct in the form, not to retype from scratch.
    error(apiErrorMessage(err, "Eroare la actualizarea sălii"));
  }
}

async function handleAddRoom(locationId: number) {
  const draft = newRoom[locationId];
  if (!draft?.name.trim()) {
    error("Sala are nevoie de un nume");
    return;
  }
  try {
    await roomsApi.createRoom({
      name: draft.name.trim(),
      locationId,
      capacity: draft.capacity,
      ...(draft.computers ? { computers: draft.computers } : {}),
    } as { name: string; locationId: number; capacity: number });
    newRoom[locationId] = blankRoom();
    success("Sală adăugată");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la adăugarea sălii"));
  }
}

async function handleDeleteRoom(roomId: number) {
  try {
    await roomsApi.deleteRoom(roomId);
    success("Sală ștearsă");
  } catch (err: unknown) {
    // The API refuses to delete a room that still hosts groups, and says so — that message is
    // the useful half of this interaction, not the failure itself.
    error(apiErrorMessage(err, "Eroare la ștergerea sălii"));
  }
}

async function handleDeleteLocation(locationId: number) {
  try {
    await locationsApi.deleteLocation(locationId);
    success("Locație ștearsă");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la ștergerea locației"));
  }
}
</script>
