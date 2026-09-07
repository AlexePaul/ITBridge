<template>
  <AdminPage
    title="Orarul"
    subtitle="Ce se ține și ce nu. O oră se poate anula, muta, recupera sau pune la loc de aici — familiile grupei află prin email de fiecare dată."
    width="xl"
  >
    <template #actions>
      <UBadge v-if="sessions.length > 0" color="neutral" variant="subtle" size="lg">
        {{ sessions.length }} {{ sessions.length === 1 ? "oră" : "ore" }}
      </UBadge>
      <!-- The entry point for a class that has no row to press a button on: the generator skipped
           the day because the calendar closed it (E12/S9). -->
      <UButton variant="soft" icon="i-lucide-calendar-sync" @click="startRecover(null)">
        Recuperează o oră
      </UButton>
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
            <UBadge v-if="session.isVacation" color="warning" variant="subtle" size="sm">
              Vacanță
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
            <!-- A cancelled class that has to happen somewhere else this week: one act, one
                 message, not reinstate-then-move (E12/S9). -->
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-calendar-sync"
              @click="startRecover(session)"
            >
              Recuperează
            </UButton>
          </template>
          <template v-else-if="session.hasAttendance">
            <!-- A class with a register against it happened. The API refuses both actions, so the
                 screen says why instead of offering a button that returns 409. What can still
                 change is the vacation tick (E12/S8), until the month is invoiced. -->
            <span class="text-sm text-muted">S-a ținut</span>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :icon="session.isVacation ? 'i-lucide-sun-dim' : 'i-lucide-sun'"
              :loading="vacationSavingId === session.id"
              @click="toggleVacation(session)"
            >
              {{ session.isVacation ? "Scoate vacanța" : "Vacanță" }}
            </UButton>
          </template>
          <template v-else>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :icon="session.isVacation ? 'i-lucide-sun-dim' : 'i-lucide-sun'"
              :loading="vacationSavingId === session.id"
              @click="toggleVacation(session)"
            >
              {{ session.isVacation ? "Scoate vacanța" : "Vacanță" }}
            </UButton>
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
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-calendar-sync"
              @click="startRecover(session)"
            >
              Recuperează
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

          <p class="text-sm text-muted">
            Ora anulată nu se facturează — plata e pe ședință ținută, iar la asta nu s-a marcat
            nicio prezență. Dacă săptămâna mai are o oră potrivită, mută copiii la altă grupă din
            lista de absențe; aici nu se decide nimic despre recuperare.
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

    <!-- Recovering a class that cannot be held — E12/S9 -->
    <AdminConfirmModal
      v-model:open="recovering"
      title="Recuperează ora"
      confirm-label="Recuperează"
      :loading="saving"
      @confirm="confirmRecover"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Ora nu se poate ține — toată grupa se mută într-o fereastră liberă din aceeași
            săptămână. Familiile grupei primesc un singur email, cu noua zi și noua oră.
          </p>

          <div v-if="!recoverFromRow" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UFormField label="Grupa" name="recoverGroupId">
              <USelect v-model="recoverGroupId" :items="recoverGroupItems" class="w-full" />
            </UFormField>
            <UFormField label="Ziua în care nu se poate ține" name="recoverDate">
              <AdminDateField v-model="recoverDate" />
            </UFormField>
          </div>
          <p v-else class="text-sm font-medium">
            {{ recoverGroupName }} · {{ formatDateKey(recoverDate ?? "") }}
          </p>

          <AdminLoading v-if="windowsLoading" />
          <p v-else-if="windowsError" class="text-sm text-error">{{ windowsError }}</p>
          <template v-else-if="windowsResult">
            <p class="text-sm" :class="windowsResult.blocked ? 'text-error' : 'text-muted'">
              {{ rescheduleStateSentence(windowsResult) }}
            </p>

            <template v-if="!windowsResult.blocked">
              <p v-if="windowsByDay.length === 0" class="text-sm text-muted">
                {{ NO_WINDOWS_SENTENCE }}
              </p>
              <div v-else class="space-y-3 max-h-72 overflow-y-auto pr-1">
                <p class="text-xs text-muted">
                  Săptămâna {{ weekLabel(windowsResult.week) }} · „liber" înseamnă sala, nu
                  profesorul.
                </p>
                <div v-for="day in windowsByDay" :key="day.date">
                  <p class="text-sm font-medium mb-1 capitalize">{{ day.label }}</p>
                  <div class="flex flex-wrap gap-2">
                    <UButton
                      v-for="window in day.windows"
                      :key="windowKey(window)"
                      size="sm"
                      :variant="selectedWindowKey === windowKey(window) ? 'solid' : 'outline'"
                      :color="selectedWindowKey === windowKey(window) ? 'primary' : 'neutral'"
                      @click="selectedWindowKey = windowKey(window)"
                    >
                      {{ windowLabel(window) }}
                    </UButton>
                  </div>
                </div>
              </div>
            </template>
          </template>

          <UFormField
            label="Motivul"
            name="reason"
            required
            help="Ajunge la părinți, așa cum îl scrii."
          >
            <UInput v-model="reason" placeholder="Luni e zi liberă legală" class="w-full" />
          </UFormField>
        </div>
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
import {
  NO_WINDOWS_SENTENCE,
  groupWindowsByDay,
  rescheduleStateSentence,
  weekLabel,
  windowKey,
  windowLabel,
} from "~/composables/useRescheduleWindows";
import type {
  ClassSessionStatus,
  ClassSessionWithAttendance,
  RescheduleWindows,
} from "~/types/class-session.types";
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
 * a cancelled class offers "reactivează" and "recuperează"; a class with a register against it
 * offers nothing, because it happened and the API refuses every action; and every one of the
 * actions writes an email to the group's families, which is why each dialog says so before the
 * button is pressed.
 *
 * "Recuperează" is E12/S9: the class cannot be held at all — a public holiday, a closed building —
 * and the whole group moves into a free slot of the same week. Unlike "mută", the slot is chosen
 * from a list the API builds (the school's own hours, the rooms at the group's address, minus what
 * the calendar closes and what other classes occupy), and it works from a cancelled class or from
 * one the generator never wrote, which is why the header has a button with no row behind it.
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

const moving = ref(false);
const moveDate = ref("");
const moveStart = ref("");
const moveEnd = ref("");
const moveRoomId = ref<number | undefined>(undefined);

const reinstating = ref(false);

const vacationSavingId = ref<number | null>(null);

/**
 * The vacation tick — E12/S8. No dialog: it is one fact, reversible until the month is invoiced,
 * and the server refuses it after that with a sentence the screen shows as it is.
 */
const toggleVacation = async (session: ClassSessionWithAttendance) => {
  vacationSavingId.value = session.id;
  try {
    const updated = await sessionsApi.setVacation(session.id, !session.isVacation);
    session.isVacation = updated.isVacation;
  } catch (err: unknown) {
    error("Nu am putut schimba bifa de vacanță", apiErrorMessage(err));
  } finally {
    vacationSavingId.value = null;
  }
};

const startCancel = (session: ClassSessionWithAttendance) => {
  target.value = session;
  reason.value = "";
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
    await sessionsApi.cancelSession(target.value.id, { reason: reason.value.trim() });
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

// Recovering — E12/S9. Keyed on a group and a day rather than on `target`, because the class may
// have no row: the header button opens the dialog with a group select and a date field, a row's
// button opens it with both fixed.
const recovering = ref(false);
const recoverFromRow = ref(false);
const recoverGroupId = ref<number | undefined>(undefined);
const recoverDate = ref<string | undefined>(undefined);
const windowsLoading = ref(false);
const windowsError = ref("");
const windowsResult = ref<RescheduleWindows | null>(null);
const selectedWindowKey = ref<string | null>(null);

const recoverGroupItems = computed(() =>
  groups.value.map((group) => ({ value: group.id, label: group.name }))
);
const recoverGroupName = computed(
  () =>
    groups.value.find((group) => group.id === recoverGroupId.value)?.name ??
    target.value?.group.name ??
    ""
);
const windowsByDay = computed(() => groupWindowsByDay(windowsResult.value?.windows ?? []));
const selectedWindow = computed(
  () =>
    windowsResult.value?.windows.find((window) => windowKey(window) === selectedWindowKey.value) ??
    null
);

const loadWindows = async () => {
  selectedWindowKey.value = null;
  windowsResult.value = null;
  windowsError.value = "";
  // `AdminDateField` publishes on every keystroke; a half-typed year is not a question yet.
  if (
    !recoverGroupId.value ||
    !recoverDate.value ||
    !/^\d{4}-\d{2}-\d{2}$/.test(recoverDate.value)
  ) {
    return;
  }
  windowsLoading.value = true;
  try {
    windowsResult.value = await sessionsApi.fetchRescheduleWindows({
      groupId: recoverGroupId.value,
      date: recoverDate.value,
    });
  } catch (err: unknown) {
    windowsError.value = apiErrorMessage(err, "Nu am putut citi ferestrele libere");
  } finally {
    windowsLoading.value = false;
  }
};

const startRecover = (session: ClassSessionWithAttendance | null) => {
  target.value = session;
  reason.value = "";
  recoverFromRow.value = session !== null;
  recoverGroupId.value = session
    ? session.group.id
    : groupId.value === "all"
      ? groups.value[0]?.id
      : groupId.value;
  recoverDate.value = session ? session.date : todayKey();
  recovering.value = true;
  void loadWindows();
};

// The free-entry form asks again on every change: the group and the day are the whole question.
watch([recoverGroupId, recoverDate], () => {
  if (recovering.value && !recoverFromRow.value) void loadWindows();
});

const confirmRecover = async () => {
  const chosen = selectedWindow.value;
  if (!chosen || !recoverGroupId.value || !recoverDate.value) {
    error("Alege o fereastră", "Ora se mută într-un interval liber din listă.");
    return;
  }
  if (reason.value.trim().length < 3) {
    error("Scrie un motiv", "Părintele primește motivul în email, deci nu poate lipsi.");
    return;
  }
  saving.value = true;
  try {
    // The whole window is sent, hour and room included: the API defaults to the class's own,
    // and a window in another room at the same hour would otherwise land in the old one.
    await sessionsApi.rescheduleSession({
      groupId: recoverGroupId.value,
      date: recoverDate.value,
      targetDate: chosen.date,
      startTime: chosen.startTime,
      endTime: chosen.endTime,
      roomId: chosen.roomId,
      reason: reason.value.trim(),
    });
    success("Ora a fost recuperată", "Familiile grupei primesc un email cu noua zi și noua oră.");
    recovering.value = false;
    await load();
  } catch (err: unknown) {
    error("Eroare", apiErrorMessage(err, "Nu s-a putut recupera ora"));
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
