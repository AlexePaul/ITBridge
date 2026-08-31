<template>
  <div class="w-full max-w-lg mx-auto px-4 py-6 space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Prezența de azi</h1>
        <p class="text-muted mt-1 text-sm">{{ todayLabel }}</p>
      </div>
      <UButton to="/admin/attendance" variant="outline" size="sm">Înapoi</UButton>
    </div>

    <!-- The offline banner: how many marks wait, and a hand-crank for the impatient. -->
    <UCard v-if="pending.length > 0" variant="subtle" class="border border-warning">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-sm">
          <UIcon name="i-lucide-cloud-off" class="shrink-0" />
          <span>
            {{ pending.length }} {{ pending.length === 1 ? "marcaj așteaptă" : "marcaje așteaptă" }}
            rețeaua. Se retrimit singure.
          </span>
        </div>
        <UButton size="sm" variant="soft" :loading="flushing" @click="flushQueue">
          Retrimite
        </UButton>
      </div>
    </UCard>

    <div v-if="loadingSessions" class="py-12 text-center text-muted">Se încarcă…</div>

    <template v-else-if="!selectedSessionId">
      <div
        v-if="todaySessions.length === 0"
        class="text-center py-12 border border-dashed border-muted rounded-lg space-y-2"
      >
        <UIcon name="i-lucide-calendar-off" class="text-4xl text-muted" />
        <p class="font-medium">Nicio ședință azi</p>
        <p class="text-sm text-muted">Orarul de azi nu are nimic programat.</p>
      </div>

      <!-- More than one class today: pick. One tap, targets sized for a thumb. -->
      <div v-else class="space-y-3">
        <button
          v-for="session in todaySessions"
          :key="session.id"
          type="button"
          class="w-full flex items-center justify-between gap-4 p-4 border border-muted rounded-lg hover:bg-muted transition-colors text-left"
          @click="openSession(session.id)"
        >
          <div>
            <p class="font-medium text-lg">{{ session.group.name }}</p>
            <p class="text-muted text-sm tabular-nums">
              {{ session.startTime.slice(0, 5) }}–{{ session.endTime.slice(0, 5) }}
            </p>
          </div>
          <UBadge v-if="session.hasAttendance" color="success" variant="subtle">Marcată</UBadge>
          <UIcon v-else name="i-lucide-chevron-right" class="text-muted" />
        </button>
      </div>
    </template>

    <template v-else>
      <div v-if="loadingRegister" class="py-12 text-center text-muted">Se încarcă…</div>

      <template v-else-if="register">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-lg">{{ register.session.groupName }}</p>
            <p class="text-muted text-sm tabular-nums">
              {{ register.session.startTime.slice(0, 5) }}–{{
                register.session.endTime.slice(0, 5)
              }}
              · {{ markedCount }}/{{ register.entries.length }} marcați
            </p>
          </div>
          <UButton
            v-if="todaySessions.length > 1"
            variant="ghost"
            size="sm"
            @click="selectedSessionId = null"
          >
            Altă grupă
          </UButton>
        </div>

        <div class="space-y-2">
          <div
            v-for="entry in register.entries"
            :key="entry.childId"
            class="border border-muted rounded-lg p-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-medium text-lg min-w-0 truncate">
                {{ entry.firstName }} {{ entry.lastName }}
              </p>
              <div class="flex items-center gap-2 shrink-0">
                <UBadge v-if="entry.type === 'make-up'" color="info" variant="subtle" size="sm">
                  Recuperare
                </UBadge>
                <UIcon
                  v-if="rowState[entry.childId] === 'saving'"
                  name="i-lucide-loader-circle"
                  class="animate-spin text-muted"
                />
                <UIcon
                  v-else-if="rowState[entry.childId] === 'queued'"
                  name="i-lucide-cloud-off"
                  class="text-warning"
                />
                <UIcon
                  v-else-if="entry.present !== null"
                  name="i-lucide-check"
                  class="text-success"
                />
              </div>
            </div>

            <!-- The whole job: two targets a thumb cannot miss. -->
            <div class="grid grid-cols-2 gap-2">
              <UButton
                size="xl"
                class="justify-center min-h-12"
                :color="entry.present === true ? 'success' : 'neutral'"
                :variant="entry.present === true ? 'solid' : 'subtle'"
                @click="mark(entry, true)"
              >
                Prezent
              </UButton>
              <UButton
                size="xl"
                class="justify-center min-h-12"
                :color="entry.present === false ? 'error' : 'neutral'"
                :variant="entry.present === false ? 'solid' : 'subtle'"
                @click="mark(entry, false)"
              >
                Absent
              </UButton>
            </div>

            <!-- An unannounced absence is one tap from a call — the S7 detail. -->
            <UButton
              v-if="entry.present === false && entry.parentPhone"
              :to="`tel:${entry.parentPhone}`"
              variant="soft"
              color="warning"
              size="sm"
              class="w-full justify-center"
              icon="i-lucide-phone"
            >
              Sună părintele
            </UButton>
          </div>
        </div>
      </template>

      <UCard v-else variant="subtle" class="border border-error">
        <p class="font-medium">{{ registerError }}</p>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useNotifications } from "~/composables/useNotifications";
import { todayKey } from "~/composables/useAttendanceCalendar";
import {
  readPendingMarks,
  upsertPending,
  writePendingMarks,
  type PendingMark,
} from "~/composables/useAttendanceQueue";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";
import { SessionStatus } from "~/types/class-session.types";
import type { SessionRegister, SessionRegisterEntry } from "~/types/attendance.types";

/**
 * The tap-to-mark screen — E12/S6.
 *
 * A phone in a classroom: today's classes, the children of the chosen one, two thumb-sized targets
 * per child, and a save on every tap. A tap that the network refuses goes into the local queue
 * (`useAttendanceQueue`) and is retried when the connection returns — the server's upsert is
 * idempotent precisely so this screen can retry blindly.
 *
 * No photos, although the story sketch names them: `Child` has no photo field, and adding one is a
 * storage-and-consent question that belongs to E07/E14, not to this screen.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Prezența de azi",
});

const attendanceApi = useAttendanceApi();
const classSessionsApi = useClassSessionsApi();
const { error } = useNotifications();

const loadingSessions = ref(true);
const todaySessions = ref<ClassSessionWithAttendance[]>([]);
const selectedSessionId = ref<number | null>(null);

const register = ref<SessionRegister | null>(null);
const registerError = ref("");
const loadingRegister = ref(false);

/** Per-row feedback: the tap saved, is saving, or waits for the network. */
const rowState = reactive<Record<number, "saving" | "saved" | "queued" | undefined>>({});

const pending = ref<PendingMark[]>([]);
const flushing = ref(false);

const today = todayKey();
const todayLabel = computed(() => {
  const [year, month, day] = today.split("-");
  return `${Number(day)}.${month}.${year}`;
});

const markedCount = computed(
  () => register.value?.entries.filter((entry) => entry.present !== null).length ?? 0
);

onMounted(async () => {
  pending.value = readPendingMarks();
  window.addEventListener("online", onBackOnline);

  try {
    const sessions = await classSessionsApi.fetchSessions({ dateFrom: today, dateTo: today });
    todaySessions.value = sessions
      .filter((session) => session.status !== SessionStatus.CANCELLED)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    // One class today — straight in, no picking.
    if (todaySessions.value.length === 1) {
      await openSession(todaySessions.value[0]!.id);
    }
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la încărcarea orarului de azi"));
  } finally {
    loadingSessions.value = false;
  }

  if (pending.value.length > 0) void flushQueue();
});

onBeforeUnmount(() => {
  window.removeEventListener("online", onBackOnline);
});

const onBackOnline = () => void flushQueue();

const openSession = async (sessionId: number) => {
  selectedSessionId.value = sessionId;
  loadingRegister.value = true;
  registerError.value = "";
  try {
    register.value = await attendanceApi.fetchSessionRegister(sessionId);
  } catch (err: unknown) {
    register.value = null;
    registerError.value = apiErrorMessage(err, "Eroare la încărcarea catalogului");
  } finally {
    loadingRegister.value = false;
  }
};

/**
 * The tap. Optimistic: the button flips immediately, the request follows, and a refusal by the
 * network parks the mark in the queue rather than reverting the screen — the teacher's statement
 * stands, delivery is the phone's problem.
 */
const mark = async (entry: SessionRegisterEntry, present: boolean) => {
  if (!selectedSessionId.value) return;
  const sessionId = selectedSessionId.value;
  entry.present = present;
  rowState[entry.childId] = "saving";

  try {
    await attendanceApi.upsertMark(sessionId, entry.childId, present);
    rowState[entry.childId] = "saved";
  } catch (err: unknown) {
    // A 4xx is a real refusal (session cancelled, child gone) and deserves the toast; anything
    // network-shaped waits in the queue.
    if (isRequestRefusal(err)) {
      rowState[entry.childId] = undefined;
      entry.present = null;
      error(apiErrorMessage(err, "Marcajul a fost refuzat"));
      return;
    }
    pending.value = upsertPending(pending.value, {
      sessionId,
      childId: entry.childId,
      present,
      queuedAt: Date.now(),
    });
    writePendingMarks(pending.value);
    rowState[entry.childId] = "queued";
  }
};

/** True when the server answered and said no — as opposed to the network never delivering. */
const isRequestRefusal = (err: unknown): boolean => {
  const status = (err as { status?: number; statusCode?: number })?.status;
  return typeof status === "number" && status >= 400 && status < 500;
};

/** Retries the queue in order. Whatever still fails stays queued; the rest clears. */
const flushQueue = async () => {
  if (flushing.value || pending.value.length === 0) return;
  flushing.value = true;
  const remaining: PendingMark[] = [];

  for (const queued of pending.value) {
    try {
      await attendanceApi.upsertMark(queued.sessionId, queued.childId, queued.present);
      if (queued.sessionId === selectedSessionId.value) {
        rowState[queued.childId] = "saved";
      }
    } catch (err: unknown) {
      if (isRequestRefusal(err)) {
        // The server said no — retrying forever would not change its mind. Drop it and say so.
        error(apiErrorMessage(err, "Un marcaj din coadă a fost refuzat"));
      } else {
        remaining.push(queued);
      }
    }
  }

  pending.value = remaining;
  writePendingMarks(remaining);
  flushing.value = false;
};
</script>
