<template>
  <div class="w-full max-w-lg mx-auto px-4 py-6 space-y-6">
    <!-- No page heading of its own: the navbar above already renders "Prezența de azi" as the
         page's `h1`, and repeating it cost the top of a phone screen to say the same thing twice.
         What is left is the one fact the bar does not carry — which day is being marked. -->
    <div class="space-y-3">
      <div class="flex items-center justify-between gap-4">
        <p class="text-muted text-sm tabular-nums">
          {{ dayText }}<template v-if="!isToday"> · zi trecută</template>
        </p>
        <UButton to="/admin/attendance" variant="outline" class="min-h-11 shrink-0">Înapoi</UButton>
      </div>
      <!-- Any day up to today, not today only (review of 26 September 2026): this is the one
           screen that can finish or correct a register already begun, so yesterday's forgotten
           one is finished here too. No later day — a mark is about a class that took place. -->
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          variant="outline"
          class="min-h-11 shrink-0"
          aria-label="Ziua anterioară"
          @click="goToDay(shiftDay(day, -1))"
        />
        <AdminDateField
          :model-value="day"
          :max="today"
          label="ziua catalogului"
          class="flex-1"
          @update:model-value="(value: string | undefined) => value && goToDay(value)"
        />
        <UButton
          icon="i-lucide-chevron-right"
          variant="outline"
          class="min-h-11 shrink-0"
          aria-label="Ziua următoare"
          :disabled="isToday"
          @click="goToDay(shiftDay(day, 1))"
        />
      </div>
    </div>

    <!-- Signed out, not refused: a 401 says nothing about the marks, so they stay on the phone and
         go once the teacher is back in — the login returns here, and opening the screen drains the
         queue. They used to be reverted and dropped as „refuzat" (review of 26 September 2026). -->
    <UCard v-if="signInNeeded" variant="subtle" class="border border-error">
      <div class="space-y-3 text-sm">
        <p class="flex items-center gap-2 font-medium">
          <UIcon name="i-lucide-log-in" class="shrink-0" />
          Sesiunea a expirat. Intră din nou în cont.
        </p>
        <p>
          {{
            pending.length === 1
              ? "Marcajul tău rămâne pe telefon"
              : `Cele ${pending.length} marcaje rămân pe telefon`
          }}
          și pleacă singure după autentificare. Nu se pierde nimic.
        </p>
        <UButton :to="signInLink" class="min-h-11">Intră în cont</UButton>
      </div>
    </UCard>

    <!-- The offline banner: how many marks wait, and a hand-crank for the impatient. -->
    <UCard v-else-if="pending.length > 0" variant="subtle" class="border border-warning">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 text-sm">
          <UIcon name="i-lucide-cloud-off" class="shrink-0" />
          <span>
            {{ pending.length }} {{ pending.length === 1 ? "marcaj așteaptă" : "marcaje așteaptă" }}
            rețeaua. Se retrimit singure.
          </span>
        </div>
        <UButton variant="soft" class="min-h-11 shrink-0" :loading="flushing" @click="flushQueue">
          Retrimite
        </UButton>
      </div>
    </UCard>

    <div v-if="loadingSessions" class="py-12 text-center text-muted">Se încarcă…</div>

    <template v-else-if="!selectedSessionId">
      <div
        v-if="daySessions.length === 0"
        class="text-center py-12 border border-dashed border-muted rounded-lg space-y-2"
      >
        <UIcon name="i-lucide-calendar-off" class="text-4xl text-muted" />
        <template v-if="isToday">
          <p class="font-medium">Nicio ședință azi</p>
          <p class="text-sm text-muted">Orarul de azi nu are nimic programat.</p>
        </template>
        <template v-else>
          <p class="font-medium">Nicio ședință în ziua asta</p>
          <p class="text-sm text-muted">Orarul zilei n-a avut nimic programat sau s-a anulat.</p>
        </template>
      </div>

      <!-- More than one class that day: pick. One tap, targets sized for a thumb. -->
      <div v-else class="space-y-3">
        <button
          v-for="session in daySessions"
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
            <!--
              E12/S8. The teacher in the room is the one who knows this was a holiday hour, and
              today is when they know it — so the tick lives here, not on the issuing screen three
              weeks later. It changes nothing about the register; it changes what the hour costs
              (E15/S9: only the children marked present pay for it).
            -->
            <label class="mt-2 flex items-center gap-2 min-h-11 text-sm cursor-pointer select-none">
              <UCheckbox
                :model-value="register.session.isVacation"
                :disabled="savingVacation"
                @update:model-value="(value) => setVacation(value === true)"
              />
              <span>Oră de vacanță — se facturează doar cine a venit</span>
            </label>
          </div>
          <UButton
            v-if="daySessions.length > 1"
            variant="ghost"
            class="min-h-11 shrink-0"
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
                <UBadge
                  v-if="entry.announcedAbsence"
                  :color="entry.announcedAbsence.inTime ? 'warning' : 'neutral'"
                  variant="subtle"
                  size="sm"
                >
                  Anunțat
                </UBadge>
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

            <!-- What the family said, before the class. The teacher reads it and does not have
                 to make the call the button below offers. -->
            <p v-if="entry.announcedAbsence" class="text-sm text-muted">
              {{ entry.announcedAbsence.reason }}
            </p>

            <!-- A child from another group (E12/S4): the teacher has not met them, so the register
                 says who they are before the tap. -->
            <p v-if="entry.visitingFrom" class="text-sm text-muted">
              Vine de la grupa {{ entry.visitingFrom }}, mutat aici pe săptămâna asta.
            </p>

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

            <!-- An **unannounced** absence is one tap from a call — the S7 detail. A family that
                 announced has already answered the question the call would ask. Today only: the
                 call is for a child who may be on the way, and on a past day the class is over and
                 a correction to the register is not news to ring a family with. -->
            <UButton
              v-if="
                isToday && entry.present === false && entry.parentPhone && !entry.announcedAbsence
              "
              :to="`tel:${entry.parentPhone}`"
              variant="soft"
              color="warning"
              class="min-h-11 w-full justify-center"
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
import { useMarkQueue } from "~/composables/useMarkQueue";
import { dayLabel, registerDay, shiftDay } from "~/composables/useRegisterDay";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";
import { SessionStatus } from "~/types/class-session.types";
import type { SessionRegister, SessionRegisterEntry } from "~/types/attendance.types";

/**
 * The tap-to-mark screen — E12/S6.
 *
 * A phone in a classroom: today's classes, the children of the chosen one, two thumb-sized targets
 * per child, and a save on every tap. Any earlier day too, from `?zi=` (`useRegisterDay`): the
 * per-child save is what a half-taken register needs, so this is where one is finished.
 *
 * A tap that the network refuses goes into the local queue (`useMarkQueue`, over the storage in
 * `useAttendanceQueue`) and is retried when the connection returns — the server's upsert is
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

const route = useRoute();
const router = useRouter();

const today = todayKey();
/** The day on screen: `?zi=` when it names today or a day before; today otherwise. */
const day = ref(registerDay(route.query.zi, today));
const isToday = computed(() => day.value === today);
const dayText = computed(() => dayLabel(day.value));

const loadingSessions = ref(true);
const daySessions = ref<ClassSessionWithAttendance[]>([]);
const selectedSessionId = ref<number | null>(null);

const register = ref<SessionRegister | null>(null);
const registerError = ref("");
const loadingRegister = ref(false);

/** Per-row feedback: the tap saved, is saving, or waits for the network. */
const rowState = reactive<Record<number, "saving" | "saved" | "queued" | undefined>>({});

const queue = useMarkQueue({
  send: (queued) => attendanceApi.upsertMark(queued.sessionId, queued.childId, queued.present),
  onDelivered: (queued) => {
    // A tap still on its way owns the row; the queued mark it replaced is old news.
    if (queued.sessionId === selectedSessionId.value && rowState[queued.childId] !== "saving") {
      rowState[queued.childId] = "saved";
    }
  },
  onRefused: (_queued, err) => error(apiErrorMessage(err, "Un marcaj din coadă a fost refuzat")),
});
const { pending, flushing, signInNeeded } = queue;
const flushQueue = queue.flush;

/** The login form, told to come back to this very screen — where the queue drains on opening. */
const signInLink = computed(() => ({
  path: "/auth/login",
  query: { inapoi: route.fullPath },
}));

const markedCount = computed(
  () => register.value?.entries.filter((entry) => entry.present !== null).length ?? 0
);

/** The day's classes; with only one, straight into its register, no picking. */
const loadDay = async () => {
  const requested = day.value;
  loadingSessions.value = true;
  selectedSessionId.value = null;
  register.value = null;
  registerError.value = "";
  try {
    const sessions = await classSessionsApi.fetchSessions({
      dateFrom: requested,
      dateTo: requested,
    });
    // Another day was picked while this one loaded; its own load owns the screen.
    if (requested !== day.value) return;
    daySessions.value = sessions
      .filter((session) => session.status !== SessionStatus.CANCELLED)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (daySessions.value.length === 1) {
      await openSession(daySessions.value[0]!.id);
    }
  } catch (err: unknown) {
    if (requested !== day.value) return;
    daySessions.value = [];
    error(apiErrorMessage(err, "Eroare la încărcarea orarului zilei"));
  } finally {
    if (requested === day.value) loadingSessions.value = false;
  }
};

/** Today stays the bare address, so the screen a teacher bookmarks is the one for the class now. */
const goToDay = (next: string) => {
  const target = registerDay(next, today);
  if (target === day.value) return;
  void router.replace({ query: { ...route.query, zi: target === today ? undefined : target } });
};

// The query is the source of truth, so the browser's back button walks the days as well.
watch(
  () => route.query.zi,
  (zi) => {
    const next = registerDay(zi, today);
    if (next === day.value) return;
    day.value = next;
    void loadDay();
  }
);

onMounted(async () => {
  queue.load();
  window.addEventListener("online", queue.onBackOnline);

  await loadDay();

  if (pending.value.length > 0) void flushQueue();
});

onBeforeUnmount(() => {
  window.removeEventListener("online", queue.onBackOnline);
  queue.cancelRetry();
});

const savingVacation = ref(false);

/**
 * Saves the tick straight away, like every mark on this screen. Refused once the month is
 * invoiced — the server says so, and the box springs back to what the server holds.
 */
const setVacation = async (isVacation: boolean) => {
  if (!register.value || savingVacation.value) return;
  savingVacation.value = true;
  try {
    const updated = await classSessionsApi.setVacation(register.value.session.id, isVacation);
    register.value.session.isVacation = updated.isVacation;
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut salva bifa de vacanță"));
  } finally {
    savingVacation.value = false;
  }
};

const openSession = async (sessionId: number) => {
  selectedSessionId.value = sessionId;
  loadingRegister.value = true;
  registerError.value = "";
  try {
    const loaded = await attendanceApi.fetchSessionRegister(sessionId);
    // What the phone still holds for this class is the teacher's word, not yet the server's: the
    // row shows it, with the cloud icon, instead of whatever was there before the tap.
    for (const key of Object.keys(rowState)) delete rowState[Number(key)];
    for (const entry of loaded.entries) {
      const queued = queue.queuedFor(sessionId, entry.childId);
      if (!queued) continue;
      entry.present = queued.present;
      rowState[entry.childId] = "queued";
    }
    register.value = loaded;
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
  const tapId = (latestTap[entry.childId] ?? 0) + 1;
  latestTap[entry.childId] = tapId;
  entry.present = present;
  rowState[entry.childId] = "saving";

  const result = await queue.tap({ sessionId, childId: entry.childId, present });
  // A second tap on the same row made meanwhile owns it now; this answer is about an older one.
  if (latestTap[entry.childId] !== tapId || selectedSessionId.value !== sessionId) return;
  if (result.outcome === "saved") {
    rowState[entry.childId] = "saved";
  } else if (result.outcome === "refused") {
    // A 4xx is a real refusal (session cancelled, child gone) and deserves the toast. Not a 401 or
    // a 403: those come back as `signed-out`, queued, with the banner above asking for a login.
    rowState[entry.childId] = undefined;
    entry.present = null;
    error(apiErrorMessage(result.error, "Marcajul a fost refuzat"));
  } else {
    rowState[entry.childId] = "queued";
  }
};

/** Which tap on a row is the newest, so an older answer arriving late does not repaint it. */
const latestTap: Record<number, number> = {};
</script>
