<template>
  <div class="portal-page">
    <div class="portal-head">
      <span class="kicker">Portalul familiei</span>
      <h1 class="portal-title">Absențe și recuperări</h1>
      <!--
        The deadline, in one sentence rather than a paragraph. The rule itself is frozen on the
        server when a notice is written (`inTime`), so this is a description of it, not a second copy.
      -->
      <p class="lede measure-wide">
        O absență anunțată <strong>înainte de începerea orei</strong> devine un credit de
        recuperare. Anunțată după — nu se mai poate recupera.
      </p>
    </div>

    <div v-if="children.length > 1" class="switcher-slot">
      <ChildSwitcher :children="children" />
    </div>

    <p v-if="loading" class="portal-empty">Se încarcă…</p>

    <div v-else-if="loadError" class="portal-card portal-card-accent portal-notice" role="alert">
      <p class="body-text">{{ loadError }}</p>
    </div>

    <template v-else>
      <!-- Upcoming classes, each with the way to announce an absence in advance. -->
      <section class="portal-section">
        <h2 class="portal-label">{{ scopeLabel }} · ore viitoare</h2>

        <p v-if="visibleUpcoming.length === 0" class="portal-empty">
          Nu e nicio oră în orar deocamdată. Apar aici imediat ce le programăm.
        </p>

        <div v-else class="rows">
          <div
            v-for="entry in visibleUpcoming"
            :key="`${entry.child.id}-${entry.session.id}`"
            class="portal-row"
          >
            <div class="portal-row-main">
              <p class="portal-when">
                {{ entry.child.firstName }} · {{ formatDateKey(entry.session.date) }} ·
                {{ formatTime(entry.session.startTime) }}–{{ formatTime(entry.session.endTime) }}
              </p>
              <p class="portal-where">{{ placeOf(entry.session) }}</p>
            </div>

            <span v-if="entry.announced" class="portal-label portal-done">
              <UIcon name="i-lucide-check" class="tick" />
              Anunțat
            </span>
            <button
              v-else
              type="button"
              class="btn btn-primary row-action"
              @click="openAnnounce(entry)"
            >
              Anunță absența
            </button>
          </div>
        </div>
      </section>

      <!--
        Make-up credits, in three visually distinct states. The difference is drawn in the frame
        rather than in a coloured word: open is an accent outline, booked is a plain outline with a
        tick, expired is a dashed outline that was never filled in. All three survive greyscale.
      -->
      <section class="portal-section">
        <h2 class="portal-label">{{ scopeLabel }} · credite de recuperare</h2>

        <p v-if="visibleCredits.length === 0" class="portal-empty">
          Niciun credit de recuperare — nu s-a anunțat nicio absență în termen.
        </p>

        <div v-else class="portal-grid portal-grid-wide credits">
          <div
            v-for="credit in visibleCredits"
            :key="credit.id"
            class="portal-card"
            :class="{
              'portal-card-accent': credit.status === 'available',
              'portal-card-spent': credit.status === 'expired' || credit.status === 'consumed',
            }"
          >
            <span v-if="credit.status === 'available'" class="portal-label">Deschis</span>
            <span v-else-if="credit.status === 'booked'" class="portal-label portal-done">
              <UIcon name="i-lucide-check" class="tick" />
              Programat
            </span>
            <span v-else-if="credit.status === 'consumed'" class="portal-label">Folosit</span>
            <span v-else class="portal-label">Expirat</span>

            <p v-if="credit.status === 'booked' && credit.bookedSession" class="portal-card-title">
              {{ formatDateKey(credit.bookedSession.date) }} ·
              {{ formatTime(credit.bookedSession.startTime) }}
            </p>
            <p v-else-if="credit.status === 'available'" class="portal-card-title">
              O oră de recuperat
            </p>
            <p v-else class="portal-card-title">O oră nefolosită</p>

            <p class="body-text">
              {{ credit.child.firstName }} — din absența de pe
              {{ formatDateKey(credit.originSession.date) }}.
              <template v-if="credit.status === 'available'">
                <strong>Expiră pe {{ formatDateKey(credit.expiresOn) }}.</strong>
              </template>
              <template v-else-if="credit.status === 'booked' && credit.bookedSession">
                La {{ credit.bookedSession.group?.name ?? "grupa aleasă" }}.
              </template>
              <template v-else-if="credit.status === 'expired'">
                A expirat pe {{ formatDateKey(credit.expiresOn) }}.
              </template>
            </p>

            <button
              v-if="credit.status === 'available'"
              type="button"
              class="btn btn-primary card-action"
              :disabled="optionsForCredit === credit.id"
              @click="openBooking(credit)"
            >
              {{ optionsForCredit === credit.id ? "Se încarcă…" : "Alege o oră" }}
            </button>
            <button
              v-else-if="credit.status === 'booked'"
              type="button"
              class="btn btn-ghost card-action"
              :disabled="cancellingId === credit.id"
              @click="cancelBooking(credit)"
            >
              Anulează programarea
            </button>
          </div>
        </div>
      </section>

      <!-- What has already been announced, and what each announcement earned. -->
      <section class="portal-section">
        <h2 class="portal-label">{{ scopeLabel }} · absențe anunțate</h2>

        <p v-if="visibleNotices.length === 0" class="portal-empty">
          Nicio absență anunțată deocamdată.
        </p>

        <div v-else class="rows">
          <div v-for="notice in visibleNotices" :key="notice.id" class="portal-row">
            <div class="portal-row-main">
              <p class="portal-when">
                {{ notice.child.firstName }} · {{ formatDateKey(notice.classSession.date) }}
              </p>
              <p class="portal-where">{{ notice.reason }}</p>
            </div>

            <!--
              `inTime` is frozen when the notice is written, so this says what the announcement
              actually earned rather than re-judging a deadline that has since passed.
            -->
            <p class="outcome" :class="{ 'outcome-quiet': !notice.inTime }">
              {{
                notice.inTime
                  ? "Anunțată în termen"
                  : "Anunțată după începerea orei — fără recuperare"
              }}
            </p>

            <button
              type="button"
              class="btn btn-ghost row-action"
              :disabled="withdrawingId === notice.id"
              @click="withdraw(notice)"
            >
              Vine totuși
            </button>
          </div>
        </div>
      </section>
    </template>

    <UModal v-model:open="bookingOpen" title="Alege ora de recuperare">
      <template #body>
        <p v-if="options.length === 0" class="portal-empty">
          Nu e nicio grupă cu loc liber și vârstă potrivită înainte de expirare. Sună-ne la
          <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a> și găsim împreună.
        </p>
        <div v-else class="rows">
          <button
            v-for="option in options"
            :key="option.sessionId"
            type="button"
            class="portal-row option-row"
            :disabled="bookingId !== null"
            @click="book(option)"
          >
            <span class="portal-row-main">
              <span class="portal-when">
                {{ formatDateKey(option.date) }}, {{ formatTime(option.startTime) }}
              </span>
              <span class="portal-where">
                {{ option.groupName
                }}<template v-if="option.locationName"> · {{ option.locationName }}</template>
              </span>
            </span>
            <UIcon
              :name="
                bookingId === option.sessionId ? 'i-lucide-loader-circle' : 'i-lucide-chevron-right'
              "
              :class="bookingId === option.sessionId ? 'animate-spin' : ''"
            />
          </button>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="formOpen" title="Anunță absența">
      <template #body>
        <form id="absence-form" class="form" @submit.prevent="submit">
          <p v-if="selectedEntry" class="body-text">
            {{ selectedEntry.child.firstName }}, {{ formatDateKey(selectedEntry.session.date) }},
            ora {{ formatTime(selectedEntry.session.startTime) }}.
          </p>
          <div class="field">
            <label for="absence-reason">Motivul</label>
            <textarea
              id="absence-reason"
              v-model="reason"
              class="input"
              rows="3"
              placeholder="Răcit, îl ținem acasă"
            ></textarea>
            <p class="field-hint">
              O propoziție e de ajuns. O citește profesorul, nu ajunge nicăieri altundeva.
            </p>
          </div>
        </form>
      </template>
      <template #footer>
        <div class="modal-actions">
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="saving"
            @click="formOpen = false"
          >
            Renunță
          </button>
          <button
            type="submit"
            form="absence-form"
            class="btn btn-primary"
            :disabled="reason.trim().length < 3 || saving"
          >
            {{ saving ? "Se trimite…" : "Trimite" }}
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { apiErrorMessage } from "~/composables/useApiError";
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useChildSelection } from "~/composables/useChildSelection";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useChildrenStore } from "~/stores/childrenStore";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey } from "~/composables/useAdminFormat";
import { formatTime } from "~/composables/useUtils";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { SessionStatus } from "~/types/class-session.types";
import type { ClassSession, ClassSessionWithAttendance } from "~/types/class-session.types";
import type { AbsenceNotice, MakeUpCredit, MakeUpOption } from "~/types/attendance.types";
import type { Child } from "~/types/child.types";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

/**
 * Absențe și recuperări — E12/S3 and S4, on the E18/S4 design.
 *
 * Three things at once, in the order a returning parent wants them: the classes still to come and
 * the way to announce one, the credits an announcement earned, and the record of what has already
 * been announced.
 *
 * The behaviour underneath is unchanged — announcing marks nobody absent, the register stays the
 * teacher's, and the server re-checks a seat between reading the list and pressing the button. What
 * changed is that the three credit states are now told apart by the shape of their frame rather than
 * by a coloured word, and that every heading names the child it is about.
 */
definePageMeta({
  layout: "portal" as any,
  title: "Absențe și recuperări",
});

const attendanceApi = useAttendanceApi();
const childrenApi = useChildrenApi();
const classSessionsApi = useClassSessionsApi();
const childrenStore = useChildrenStore();
const { success, error } = useNotifications();
const { includes, isShowingAll, selected, reconcile } = useChildSelection();

const loading = ref(true);
const loadError = ref("");
const notices = ref<AbsenceNotice[]>([]);
const upcoming = ref<{ child: Child; session: ClassSessionWithAttendance; announced: boolean }[]>(
  []
);

const credits = ref<MakeUpCredit[]>([]);
const options = ref<MakeUpOption[]>([]);
const bookingOpen = ref(false);
const optionsForCredit = ref<number | null>(null);
const bookingId = ref<number | null>(null);
const cancellingId = ref<number | null>(null);
let creditBeingBooked: MakeUpCredit | null = null;

const formOpen = ref(false);
const saving = ref(false);
const reason = ref("");
/** The row the announce dialog is about — not to be confused with the selected *child*. */
const selectedEntry = ref<{ child: Child; session: ClassSessionWithAttendance } | null>(null);
const withdrawingId = ref<number | null>(null);

const today = todayKey();

const children = computed(() => childrenStore.children);

/**
 * Whose data the section headings are about.
 *
 * Every block repeats it, which is the redundancy the design leans on: a parent who never notices
 * the switcher still reads the child's name against the figures rather than beside them.
 */
const scopeLabel = computed(() => {
  if (isShowingAll.value) return "Toți copiii";
  return children.value.find((child) => child.id === selected.value)?.firstName ?? "Copilul ales";
});

const visibleUpcoming = computed(() => upcoming.value.filter((row) => includes(row.child.id)));
const visibleCredits = computed(() => credits.value.filter((row) => includes(row.child.id)));
const visibleNotices = computed(() => notices.value.filter((row) => includes(row.child.id)));

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const [fetched] = await Promise.all([
      childrenApi.fetchChildren(),
      refreshNotices(),
      refreshCredits(),
    ]);
    const mine = (fetched ?? (childrenStore.children as Child[])) as Child[];
    reconcile(mine);

    const rows: { child: Child; session: ClassSessionWithAttendance; announced: boolean }[] = [];
    for (const child of mine) {
      if (!child.group) continue;
      const sessions = await classSessionsApi.fetchSessions({ groupId: child.group.id });
      for (const session of sessions) {
        // Only what can still be announced: future, and not called off.
        if (session.date < today) continue;
        if (session.status === SessionStatus.CANCELLED) continue;
        rows.push({ child, session, announced: isAnnounced(child.id, session.id) });
      }
    }
    upcoming.value = rows.sort(
      (a, b) =>
        a.session.date.localeCompare(b.session.date) ||
        a.session.startTime.localeCompare(b.session.startTime)
    );
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea orarului");
  } finally {
    loading.value = false;
  }
};

const refreshNotices = async () => {
  notices.value = await attendanceApi.fetchUpcomingAbsences();
};

const refreshCredits = async () => {
  credits.value = await attendanceApi.fetchMakeUpCredits();
};

/** Where a class is: the room, then the street it is on. */
const placeOf = (session: ClassSession): string => {
  const room = session.room;
  if (!room) return "";
  const location = room.location;
  if (!location) return room.name;
  return `${room.name} · ${location.street} — ${location.name}`;
};

/**
 * Opening the picker fetches the options rather than the page pre-loading them: a family usually
 * has no credits, and when they do they have one.
 */
const openBooking = async (credit: MakeUpCredit) => {
  optionsForCredit.value = credit.id;
  creditBeingBooked = credit;
  try {
    options.value = await attendanceApi.fetchMakeUpOptions(credit.id);
    bookingOpen.value = true;
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut încărca orele disponibile"));
  } finally {
    optionsForCredit.value = null;
  }
};

const book = async (option: MakeUpOption) => {
  if (!creditBeingBooked) return;
  bookingId.value = option.sessionId;
  try {
    await attendanceApi.bookMakeUp(creditBeingBooked.id, option.sessionId);
    success("Recuperarea a fost programată.");
    bookingOpen.value = false;
    await refreshCredits();
  } catch (err: unknown) {
    // A seat can go between reading the list and pressing the button; the server re-checks, and
    // this is where the family finds out.
    error(apiErrorMessage(err, "Nu am putut programa recuperarea"));
  } finally {
    bookingId.value = null;
  }
};

const cancelBooking = async (credit: MakeUpCredit) => {
  cancellingId.value = credit.id;
  try {
    await attendanceApi.cancelMakeUpBooking(credit.id);
    success("Programarea a fost anulată. Recuperarea rămâne disponibilă.");
    await refreshCredits();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut anula programarea"));
  } finally {
    cancellingId.value = null;
  }
};

const isAnnounced = (childId: number, sessionId: number) =>
  notices.value.some(
    (notice) => notice.child.id === childId && notice.classSession.id === sessionId
  );

onMounted(load);

const openAnnounce = (entry: { child: Child; session: ClassSessionWithAttendance }) => {
  selectedEntry.value = entry;
  reason.value = "";
  formOpen.value = true;
};

const submit = async () => {
  if (!selectedEntry.value || reason.value.trim().length < 3) return;
  saving.value = true;
  try {
    await attendanceApi.announceAbsence({
      childId: selectedEntry.value.child.id,
      classSessionId: selectedEntry.value.session.id,
      reason: reason.value.trim(),
    });
    success("Am notat. Profesorul vede înainte de oră.");
    formOpen.value = false;
    await refreshNotices();
    markAnnounced(selectedEntry.value.child.id, selectedEntry.value.session.id, true);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut înregistra anunțul"));
  } finally {
    saving.value = false;
  }
};

const withdraw = async (notice: AbsenceNotice) => {
  withdrawingId.value = notice.id;
  try {
    await attendanceApi.withdrawAbsence(notice.id);
    success("Am șters anunțul.");
    await refreshNotices();
    markAnnounced(notice.child.id, notice.classSession.id, false);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut retrage anunțul"));
  } finally {
    withdrawingId.value = null;
  }
};

/** Keeps the list in step without refetching every group's timetable. */
const markAnnounced = (childId: number, sessionId: number, announced: boolean) => {
  const row = upcoming.value.find(
    (entry) => entry.child.id === childId && entry.session.id === sessionId
  );
  if (row) row.announced = announced;
};
</script>

<style scoped>
.switcher-slot {
  margin-top: var(--rhythm-2);
}

.rows {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-2);
}

.credits {
  margin-top: var(--space-4);
}

.row-action,
.card-action {
  min-height: 44px;
}

.card-action {
  align-self: flex-start;
  margin-top: var(--space-1);
}

.tick {
  width: 14px;
  height: 14px;
  color: var(--color-accent);
}

.outcome {
  font-size: 14.5px;
  line-height: 24px;
  margin: 0;
  color: var(--color-accent-ink);
}

.outcome-quiet {
  color: color-mix(in srgb, var(--color-text) 70%, transparent);
}

/* The booking options are rows that are also buttons. */
.option-row {
  width: 100%;
  text-align: left;
  background: transparent;
  border-top: 0;
  border-inline: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.option-row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent) 6%, transparent);
}

.option-row:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.option-row .portal-row-main {
  display: flex;
  flex-direction: column;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  width: 100%;
}
</style>
