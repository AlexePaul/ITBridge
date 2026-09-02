<template>
  <AdminPage
    title="Orarul"
    subtitle="Ce se ține și ce nu. O oră se poate anula, muta sau pune la loc de aici — familiile grupei află prin email de fiecare dată."
    width="xl"
  >
    <template #actions>
      <UBadge v-if="sessions.length > 0" color="neutral" variant="subtle" size="lg">
        {{ sessions.length }} {{ sessions.length === 1 ? "oră" : "ore" }}
      </UBadge>
    </template>

    <div class="flex flex-wrap items-end gap-3">
      <UFormField label="De la" class="w-40">
        <UInput v-model="dateFrom" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Până la" class="w-40">
        <UInput v-model="dateTo" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Grupa" class="w-56">
        <USelect v-model="groupId" :items="groupItems" class="w-full" />
      </UFormField>
      <UButton variant="soft" icon="i-lucide-refresh-cw" :loading="loading" @click="load">
        Arată
      </UButton>
    </div>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />

    <AdminEmpty
      v-else-if="sessions.length === 0"
      icon="i-lucide-calendar-off"
      title="Nicio oră în intervalul ales"
      description="Schimbă zilele, sau generează orarul din ecranul grupei dacă lipsește de tot."
    />

    <div v-else class="space-y-2">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-muted rounded-lg p-4"
        :class="session.status === SessionStatus.CANCELLED ? 'opacity-60' : ''"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium">{{ session.group.name }}</span>
            <UBadge :color="STATUS_COLORS[session.status]" variant="subtle" size="sm">
              {{ CLASS_SESSION_STATUS_LABELS[session.status] }}
            </UBadge>
            <UBadge v-if="session.hasAttendance" color="neutral" variant="subtle" size="sm">
              Catalog făcut
            </UBadge>
          </div>
          <p class="text-sm text-muted tabular-nums mt-0.5">
            {{ formatDateKey(session.date) }} · {{ session.startTime.slice(0, 5) }}–{{
              session.endTime.slice(0, 5)
            }}
            ·
            {{ session.room.name }}
            <template v-if="session.room.location">— {{ session.room.location.name }}</template>
          </p>
          <p v-if="session.notes" class="text-sm text-muted mt-1 whitespace-pre-line">
            {{ session.notes }}
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <template v-if="session.status === SessionStatus.CANCELLED">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-rotate-ccw"
              @click="askReinstate(session)"
            >
              Reactivează
            </UButton>
          </template>
          <template v-else-if="session.hasAttendance">
            <!-- A class with a register against it happened. The API refuses both actions, so the
                 screen says why instead of offering a button that returns 409. -->
            <span class="text-sm text-muted">S-a ținut</span>
          </template>
          <template v-else>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-move-right"
              @click="startMove(session)"
            >
              Mută
            </UButton>
            <UButton
              color="error"
              variant="ghost"
              size="sm"
              icon="i-lucide-calendar-x"
              @click="startCancel(session)"
            >
              Anulează
            </UButton>
          </template>
        </div>
      </div>
    </div>

    <!-- Cancelling -->
    <AdminConfirmModal
      v-model:open="cancelling"
      title="Anulează ora"
      confirm-label="Anulează ora"
      danger
      :loading="saving"
      @confirm="confirmCancel"
    >
      <template #body>
        <div v-if="target" class="space-y-4">
          <p class="text-sm text-muted">
            {{ target.group.name }} · {{ formatDateKey(target.date) }},
            {{ target.startTime.slice(0, 5) }}
          </p>

          <UFormField
            label="Motivul"
            name="reason"
            required
            help="Ajunge la părinți, așa cum îl scrii."
          >
            <UInput v-model="reason" placeholder="Profesorul este bolnav" class="w-full" />
          </UFormField>

          <UCheckbox v-model="grantMakeUp" label="Dă-le copiilor dreptul la o recuperare" />
          <p class="text-sm text-muted">
            Ora anulată nu se facturează oricum — plata e pe ședință ținută. Bifează dacă vrei ca
            școala să dea ora înapoi pe deasupra, ca la un profesor bolnav.
          </p>
        </div>
      </template>
    </AdminConfirmModal>

    <!-- Moving -->
    <AdminConfirmModal
      v-model:open="moving"
      title="Mută ora"
      confirm-label="Mută"
      :loading="saving"
      @confirm="confirmMove"
    >
      <template #body>
        <div v-if="target" class="space-y-4">
          <p class="text-sm text-muted">
            Acum: {{ formatDateKey(target.date) }}, {{ target.startTime.slice(0, 5) }}–{{
              target.endTime.slice(0, 5)
            }}, {{ target.room.name }}
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <UFormField label="Ziua" name="date">
              <UInput v-model="moveDate" type="date" class="w-full" />
            </UFormField>
            <UFormField label="De la" name="startTime">
              <UInput v-model="moveStart" type="time" class="w-full" />
            </UFormField>
            <UFormField label="Până la" name="endTime">
              <UInput v-model="moveEnd" type="time" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Sala" name="roomId">
            <USelect v-model="moveRoomId" :items="roomItems" class="w-full" />
          </UFormField>

          <UFormField
            label="Motivul"
            name="reason"
            required
            help="Ajunge la părinți, așa cum îl scrii."
          >
            <UInput v-model="reason" placeholder="Sala este ocupată" class="w-full" />
          </UFormField>
        </div>
      </template>
    </AdminConfirmModal>

    <!-- Reinstating -->
    <AdminConfirmModal
      v-model:open="reinstating"
      title="Pune ora la loc"
      confirm-label="Reactivează"
      :loading="saving"
      @confirm="confirmReinstate"
    >
      <template #body>
        <p v-if="target" class="text-sm">
          {{ target.group.name }} · {{ formatDateKey(target.date) }},
          {{ target.startTime.slice(0, 5) }}. Familiile grupei primesc un email că ora se ține
          totuși — au fost anunțate că nu se ține.
        </p>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useRoomsApi } from "~/composables/api/useRoomsApi";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey } from "~/composables/useAdminFormat";
import { todayKey } from "~/composables/useAttendanceCalendar";
import type { ClassSessionStatus, ClassSessionWithAttendance } from "~/types/class-session.types";
import { CLASS_SESSION_STATUS_LABELS, SessionStatus } from "~/types/class-session.types";
import type { Group } from "~/types/group.types";
import type { Room } from "~/types/room.types";

/**
 * The timetable an admin can act on — E12/S5.
 *
 * Cancelling and moving a class have existed since S5 was written, but only as HTTP requests: a
 * teacher falling ill on a Tuesday needed a developer. This is the screen, and it is deliberately a
 * list of the next fortnight rather than a calendar grid — the question being asked is "which class
 * is not happening", and it is asked about a handful of days at a time.
 *
 * Three rules the buttons encode rather than explain:
 * a cancelled class offers only "reactivează"; a class with a register against it offers nothing,
 * because it happened and the API refuses both actions; and every one of the three writes an email
 * to the group's families, which is why each dialog says so before the button is pressed.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Orarul",
});

const sessionsApi = useClassSessionsApi();
const groupsApi = useGroupsApi();
const roomsApi = useRoomsApi();
const { error, success } = useNotifications();

const STATUS_COLORS: Record<ClassSessionStatus, "success" | "neutral" | "error"> = {
  scheduled: "success",
  held: "neutral",
  cancelled: "error",
};

/** Two weeks from today: long enough to hold next week's problem, short enough to read. */
const DEFAULT_HORIZON_DAYS = 14;
const addDays = (key: string, days: number) => {
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(year!, month! - 1, day! + days);
  return todayKey(shifted);
};

const loading = ref(true);
const loadError = ref("");
const sessions = ref<ClassSessionWithAttendance[]>([]);
const groups = ref<Group[]>([]);
const rooms = ref<Room[]>([]);

const dateFrom = ref(todayKey());
const dateTo = ref(addDays(todayKey(), DEFAULT_HORIZON_DAYS));
const groupId = ref<number | "all">("all");

const groupItems = computed(() => [
  { value: "all" as const, label: "Toate grupele" },
  ...groups.value.map((group) => ({ value: group.id, label: group.name })),
]);

const roomItems = computed(() =>
  rooms.value.map((room) => ({
    value: room.id,
    label: room.location ? `${room.name} — ${room.location.name}` : room.name,
  }))
);

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    sessions.value = await sessionsApi.fetchSessions({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      groupId: groupId.value === "all" ? undefined : groupId.value,
    });
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea orarului");
  } finally {
    loading.value = false;
  }
};

// The three dialogs share one target and one reason field: only one can be open at a time, and
// carrying a separate copy per dialog is how a screen ends up sending last week's reason.
const target = ref<ClassSessionWithAttendance | null>(null);
const reason = ref("");
const saving = ref(false);

const cancelling = ref(false);
const grantMakeUp = ref(false);

const moving = ref(false);
const moveDate = ref("");
const moveStart = ref("");
const moveEnd = ref("");
const moveRoomId = ref<number | undefined>(undefined);

const reinstating = ref(false);

const startCancel = (session: ClassSessionWithAttendance) => {
  target.value = session;
  reason.value = "";
  grantMakeUp.value = false;
  cancelling.value = true;
};

const startMove = (session: ClassSessionWithAttendance) => {
  target.value = session;
  reason.value = "";
  // Prefilled with where the class is now, so an admin changes the one thing they mean to change
  // and the API's "the move changes nothing" refusal only fires when they really changed nothing.
  moveDate.value = session.date;
  moveStart.value = session.startTime.slice(0, 5);
  moveEnd.value = session.endTime.slice(0, 5);
  moveRoomId.value = session.room.id;
  moving.value = true;
};

const askReinstate = (session: ClassSessionWithAttendance) => {
  target.value = session;
  reinstating.value = true;
};

const confirmCancel = async () => {
  if (!target.value || reason.value.trim().length < 3) {
    error("Scrie un motiv", "Părintele primește motivul în email, deci nu poate lipsi.");
    return;
  }
  saving.value = true;
  try {
    await sessionsApi.cancelSession(target.value.id, {
      reason: reason.value.trim(),
      grantMakeUpCredits: grantMakeUp.value,
    });
    success("Ora a fost anulată", "Familiile grupei primesc un email.");
    cancelling.value = false;
    await load();
  } catch (err: unknown) {
    error("Eroare", apiErrorMessage(err, "Nu s-a putut anula ora"));
  } finally {
    saving.value = false;
  }
};

const confirmMove = async () => {
  const session = target.value;
  if (!session || reason.value.trim().length < 3) {
    error("Scrie un motiv", "Părintele primește motivul în email, deci nu poate lipsi.");
    return;
  }
  saving.value = true;
  try {
    // Only what actually changed is sent: the API treats an absent field as "leave it", and
    // sending all four would make every move look like a four-way change in the note.
    await sessionsApi.moveSession(session.id, {
      reason: reason.value.trim(),
      // A cleared input is an empty string, which the API would refuse as a malformed date; it
      // means "leave it", the same as an unchanged one.
      date: moveDate.value && moveDate.value !== session.date ? moveDate.value : undefined,
      startTime:
        moveStart.value && moveStart.value !== session.startTime.slice(0, 5)
          ? moveStart.value
          : undefined,
      endTime:
        moveEnd.value && moveEnd.value !== session.endTime.slice(0, 5) ? moveEnd.value : undefined,
      roomId: moveRoomId.value === session.room.id ? undefined : moveRoomId.value,
    });
    success("Ora a fost mutată", "Familiile grupei primesc un email cu noua zi.");
    moving.value = false;
    await load();
  } catch (err: unknown) {
    error("Eroare", apiErrorMessage(err, "Nu s-a putut muta ora"));
  } finally {
    saving.value = false;
  }
};

const confirmReinstate = async () => {
  if (!target.value) return;
  saving.value = true;
  try {
    await sessionsApi.reinstateSession(target.value.id);
    success("Ora se ține din nou", "Familiile grupei au fost anunțate.");
    reinstating.value = false;
    await load();
  } catch (err: unknown) {
    error("Eroare", apiErrorMessage(err, "Nu s-a putut reactiva ora"));
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  try {
    const [fetchedGroups, fetchedRooms] = await Promise.all([
      groupsApi.fetchGroups(),
      roomsApi.fetchRooms(),
    ]);
    groups.value = fetchedGroups ?? [];
    rooms.value = fetchedRooms ?? [];
  } catch {
    // The filters are a convenience; the timetable itself is the screen. A failure to list groups
    // leaves "toate grupele" selected rather than an empty page.
  }
  await load();
});
</script>
