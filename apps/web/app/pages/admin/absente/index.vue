<template>
  <AdminPage
    title="Absențe anunțate"
    subtitle="Părinții sună, biroul notează. Copiii anunțați în termen se mută la altă grupă din aceeași săptămână, iar familia află prin email unde."
    width="xl"
  >
    <template #actions>
      <UBadge v-if="unplaced.total > 0" color="neutral" variant="subtle" size="lg">
        {{ unplaced.total }} de mutat
      </UBadge>
      <UButton icon="i-lucide-phone-incoming" class="min-h-11" @click="startAnnounce">
        Notează o absență
      </UButton>
    </template>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError">
      <template #action>
        <UButton variant="soft" @click="load()">Încearcă din nou</UButton>
      </template>
    </AdminError>

    <template v-else>
      <!-- The Monday list: everything announced for this week and the weeks after it that nobody
           has placed yet. A late notice stays here too, with its badge — `inTime` says when the
           office typed, not when the family rang, and only the office knows which (E12/S3). -->
      <section class="space-y-3">
        <h2 class="text-lg font-semibold">De mutat</h2>

        <AdminEmpty
          v-if="worklistByWeek.length === 0"
          icon="i-lucide-calendar-check"
          title="Nimic de mutat"
          description="Absențele anunțate pentru săptămâna asta și pentru cele care urmează stau aici până muți copilul, până retragi anunțul sau până trece săptămâna lor."
        />

        <div v-for="week in worklistByWeek" :key="week.week.from" class="space-y-2">
          <h3 class="text-sm text-muted">Săptămâna {{ week.label }}</h3>
          <AdminListRow
            v-for="notice in week.notices"
            :key="notice.id"
            :title="`${notice.child.firstName} ${notice.child.lastName}`"
            :subtitle="`${notice.classSession.group.name} · ${classLabel(notice.classSession)}`"
          >
            <template #badges>
              <UBadge :color="NOTICE_STATE_COLORS[noticeState(notice)]" variant="subtle" size="sm">
                {{ NOTICE_STATE_LABELS[noticeState(notice)] }}
              </UBadge>
              <UBadge v-if="isSlipping(notice, today)" color="warning" variant="subtle" size="sm">
                Ora e azi sau a trecut
              </UBadge>
            </template>
            <p class="text-sm mt-1">{{ notice.reason }}</p>
            <template #actions>
              <UButton
                size="sm"
                variant="soft"
                icon="i-lucide-move-right"
                class="min-h-11"
                @click="startMove(notice)"
              >
                Mută
              </UButton>
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-undo-2"
                class="min-h-11"
                @click="askWithdraw(notice)"
              >
                Vine totuși
              </UButton>
            </template>
          </AdminListRow>
        </div>
      </section>

      <!-- What the office already did with this week, so a move can be looked up, changed or
           taken back without ringing anybody. -->
      <section class="space-y-3">
        <h2 class="text-lg font-semibold">Mutări consemnate</h2>

        <AdminEmpty
          v-if="placed.length === 0"
          icon="i-lucide-move-right"
          title="Nicio mutare pentru orele care urmează"
          description="Când muți un copil din lista de mai sus, apare aici cu grupa, ziua și ora la care a fost trimis."
        />

        <AdminListRow
          v-for="notice in placed"
          :key="notice.id"
          :title="`${notice.child.firstName} ${notice.child.lastName}`"
          :subtitle="`Lipsește ${classLabel(notice.classSession)} — ${notice.classSession.group.name}`"
        >
          <template #badges>
            <UBadge :color="NOTICE_STATE_COLORS.placed" variant="subtle" size="sm">
              {{ NOTICE_STATE_LABELS.placed }}
            </UBadge>
          </template>
          <p class="text-sm mt-1">{{ moveSentence(notice) }}</p>
          <template #actions>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              icon="i-lucide-move-right"
              class="min-h-11"
              @click="startMove(notice)"
            >
              Altă oră
            </UButton>
            <UButton
              size="sm"
              color="error"
              variant="ghost"
              icon="i-lucide-x"
              class="min-h-11"
              @click="askClear(notice)"
            >
              Anulează mutarea
            </UButton>
          </template>
        </AdminListRow>
      </section>
    </template>

    <!-- Recording an absence — E12/S3. The office does it, from the phone call. -->
    <AdminConfirmModal
      v-model:open="announcing"
      title="Notează o absență"
      confirm-label="Notează"
      :loading="saving"
      @confirm="confirmAnnounce"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Copilul" name="childId" required>
            <AdminLoading v-if="childrenLoading" label="Se încarcă lista copiilor…" />
            <USelectMenu
              v-else
              v-model="announceChildId"
              :items="childItems"
              value-key="id"
              searchable
              placeholder="Caută după nume"
              class="w-full"
              aria-label="Copilul care lipsește"
            />
          </UFormField>

          <UFormField label="Ora de la care lipsește" name="classSessionId" required>
            <AdminLoading v-if="sessionsLoading" label="Se citește orarul grupei…" />
            <p v-else-if="!announceChildId" class="text-sm text-muted">
              Alege întâi copilul — orele sunt ale grupei lui.
            </p>
            <p v-else-if="sessionItems.length === 0" class="text-sm text-muted">
              Grupa nu are nicio oră în orar în următoarele patru săptămâni. Generează orarul din
              ecranul grupei, apoi revino.
            </p>
            <USelect v-else v-model="announceSessionId" :items="sessionItems" class="w-full" />
          </UFormField>

          <UFormField
            label="Motivul"
            name="reason"
            required
            help="Așa cum l-a spus familia. Îl vede și ea, în portal."
          >
            <UInput v-model="announceReason" placeholder="Răcit, îl ținem acasă" class="w-full" />
          </UFormField>

          <p class="text-sm text-muted">
            Termenul e luni la 12:00 din săptămâna orei. Un anunț notat după el rămâne consemnat și
            „după termen" — dar dacă familia a sunat la timp și noi am tastat târziu, mutarea e tot
            a ta de făcut.
          </p>
        </div>
      </template>
    </AdminConfirmModal>

    <!-- Moving the child for the week — E12/S4. The list is the API's; the choice is the office's. -->
    <AdminConfirmModal
      v-model:open="moving"
      title="Mută copilul la altă grupă"
      confirm-label="Mută"
      :loading="saving"
      @confirm="confirmMove"
    >
      <template #body>
        <div v-if="target" class="space-y-4">
          <p class="text-sm text-muted">
            {{ target.child.firstName }} {{ target.child.lastName }} lipsește
            {{ classLabel(target.classSession) }} — {{ target.classSession.group.name }}.
          </p>
          <p v-if="target.replacementSession" class="text-sm">
            Acum: {{ moveSentence(target) }} Dacă alegi altă oră, familia primește un email nou.
          </p>

          <AdminLoading v-if="optionsLoading" label="Se caută orele săptămânii…" />
          <p v-else-if="optionsError" class="text-sm text-error">{{ optionsError }}</p>
          <template v-else>
            <p v-if="optionsByDay.length === 0" class="text-sm text-muted">
              {{ NO_OPTIONS_SENTENCE }}
            </p>
            <div v-else class="space-y-3 max-h-72 overflow-y-auto pr-1">
              <p class="text-xs text-muted">
                Aceeași săptămână, altă grupă, banda lui de vârstă, un loc liber. „Liber" înseamnă
                scaunul, nu profesorul.
              </p>
              <div v-for="day in optionsByDay" :key="day.date">
                <p class="text-sm font-medium mb-1 capitalize">{{ day.label }}</p>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-for="option in day.options"
                    :key="option.sessionId"
                    size="sm"
                    :variant="selectedSessionId === option.sessionId ? 'solid' : 'outline'"
                    :color="selectedSessionId === option.sessionId ? 'primary' : 'neutral'"
                    @click="selectedSessionId = option.sessionId"
                  >
                    {{ optionLabel(option) }} · {{ freeSeatsLabel(option.free) }}
                  </UButton>
                </div>
              </div>
            </div>
          </template>

          <p class="text-sm text-muted">Familia primește un email cu grupa, ziua, ora și adresa.</p>
        </div>
      </template>
    </AdminConfirmModal>

    <!-- Taking a move back. Silent by design: the API writes nobody, see ReplacementService.clear. -->
    <AdminConfirmModal
      v-model:open="clearing"
      title="Anulează mutarea"
      confirm-label="Anulează mutarea"
      danger
      :loading="saving"
      @confirm="confirmClear"
    >
      <template #body>
        <div v-if="target" class="space-y-2 text-sm">
          <p>{{ moveSentence(target) }}</p>
          <p class="text-muted">
            Copilul se întoarce pe lista de mutat, iar absența rămâne. Familia
            <strong>nu</strong> primește niciun email — dacă fusese anunțată, sun-o tu. Dacă vrei
            doar altă oră, alege „Altă oră" în loc: mesajul nou spune unde.
          </p>
        </div>
      </template>
    </AdminConfirmModal>

    <!-- Withdrawing the notice — the child is coming after all. -->
    <AdminConfirmModal
      v-model:open="withdrawing"
      title="Retrage anunțul"
      confirm-label="Vine totuși"
      danger
      :loading="saving"
      @confirm="confirmWithdraw"
    >
      <template #body>
        <div v-if="target" class="space-y-2 text-sm">
          <p>
            {{ target.child.firstName }} {{ target.child.lastName }} ·
            {{ classLabel(target.classSession) }} — {{ target.classSession.group.name }}
          </p>
          <p class="text-muted">
            Anunțul dispare, iar catalogul orei rămâne al profesorului. Dacă între timp copilul
            fusese mutat, mutarea dispare odată cu anunțul și familia nu primește email.
          </p>
        </div>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useNotifications } from "~/composables/useNotifications";
import { todayKey } from "~/composables/useAttendanceCalendar";
import {
  NOTICE_STATE_COLORS,
  NOTICE_STATE_LABELS,
  NO_OPTIONS_SENTENCE,
  addDaysToKey,
  announceableSessions,
  childChoiceLabel,
  classLabel,
  freeSeatsLabel,
  groupNoticesByWeek,
  groupOptionsByDay,
  isSlipping,
  moveSentence,
  noticeState,
  optionLabel,
  sessionChoiceLabel,
  weekOf,
} from "~/composables/useAbsenceOffice";
import { useUnplacedAbsencesStore } from "~/stores/unplacedAbsencesStore";
import type { AbsenceNotice, ReplacementOption } from "~/types/attendance.types";
import type { Child } from "~/types/child.types";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";

/**
 * The office's absences screen — E12/S3 and S4.
 *
 * Both stories shipped as API and as the parent's read-only page, and nothing in the admin area
 * pressed any of it: an absence could be recorded only with an HTTP client, and the Monday list
 * (`GET /attendance/replacements/unplaced`) had no screen. This is that screen, and it is
 * deliberately one page rather than two, because the two acts happen in one sitting — the phone
 * rings, somebody types the absence, and while the family is still on the line the office looks
 * for a class that fits.
 *
 * Three rules the buttons encode rather than explain: a late notice keeps its "mută" button,
 * because `inTime` is when the office typed and not when the family rang (E12/S3); a move writes
 * the family an email and clearing one writes nothing (E12/S4), so the two dialogs say so; and
 * the list of classes offered is the API's, re-checked when the button is pressed, so the screen
 * never promises a seat it has not been told is free.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Absențe anunțate",
});

const attendanceApi = useAttendanceApi();
const childrenApi = useChildrenApi();
const sessionsApi = useClassSessionsApi();
const unplaced = useUnplacedAbsencesStore();
const { error, success } = useNotifications();

/** How far ahead the "which class" list looks. Four weeks: a family rarely rings about later. */
const ANNOUNCE_HORIZON_DAYS = 28;

const today = todayKey();

const loading = ref(true);
const loadError = ref("");
const upcoming = ref<AbsenceNotice[]>([]);

const worklistByWeek = computed(() => groupNoticesByWeek(unplaced.notices));
const placed = computed(() => upcoming.value.filter((notice) => notice.replacementSession));

/**
 * Both lists in one go. The worklist lands in the store — the menu badge reads it — and the
 * upcoming list is page-local: it is only here to show and undo the moves already made. Both are
 * read from the Monday of the current week, not from now: a child moved out of Monday's class into
 * Thursday's is still a move on Tuesday, and the row is keyed on the class that was missed.
 * `silent` keeps the page in place while a change is being written back.
 */
const load = async (silent = false) => {
  if (!silent) loading.value = true;
  loadError.value = "";
  try {
    const [, fetchedUpcoming] = await Promise.all([
      attendanceApi.fetchUnplacedAbsences(),
      attendanceApi.fetchUpcomingAbsences(weekOf(today).from),
    ]);
    upcoming.value = fetchedUpcoming ?? [];
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea absențelor");
  } finally {
    loading.value = false;
  }
};

// The four dialogs share one target and one saving flag: only one is open at a time, and a
// separate copy per dialog is how a screen ends up acting on last week's row.
const target = ref<AbsenceNotice | null>(null);
const saving = ref(false);

// Recording
const announcing = ref(false);
const children = ref<Child[]>([]);
const childrenLoaded = ref(false);
const childrenLoading = ref(false);
const announceChildId = ref<number | undefined>(undefined);
const announceSessionId = ref<number | undefined>(undefined);
const announceReason = ref("");
const groupSessions = ref<ClassSessionWithAttendance[]>([]);
const sessionsLoading = ref(false);

/** Only children in a group: a notice is about a class, and a child with no group has none. */
const childItems = computed(() =>
  children.value
    .filter((child) => child.group)
    .map((child) => ({ id: child.id, label: childChoiceLabel(child) }))
);

const sessionItems = computed(() =>
  announceableSessions(groupSessions.value, today).map((session) => ({
    value: session.id,
    label: sessionChoiceLabel(session),
  }))
);

const startAnnounce = async () => {
  announceChildId.value = undefined;
  announceSessionId.value = undefined;
  announceReason.value = "";
  groupSessions.value = [];
  announcing.value = true;
  if (childrenLoaded.value) return;
  childrenLoading.value = true;
  try {
    children.value = (await childrenApi.fetchChildren()) ?? [];
    childrenLoaded.value = true;
  } catch (err: unknown) {
    error("Nu am putut încărca lista copiilor", apiErrorMessage(err));
  } finally {
    childrenLoading.value = false;
  }
};

// The class list follows the child: it is their group's timetable, from today on. A counter
// guards against two quick changes answering out of order.
let sessionsRequest = 0;
watch(announceChildId, async (childId) => {
  announceSessionId.value = undefined;
  groupSessions.value = [];
  const child = children.value.find((row) => row.id === childId);
  if (!child?.group) return;
  const request = ++sessionsRequest;
  sessionsLoading.value = true;
  try {
    const fetched = await sessionsApi.fetchSessions({
      groupId: child.group.id,
      dateFrom: today,
      dateTo: addDaysToKey(today, ANNOUNCE_HORIZON_DAYS),
    });
    if (request !== sessionsRequest) return;
    groupSessions.value = fetched ?? [];
    announceSessionId.value = sessionItems.value[0]?.value;
  } catch (err: unknown) {
    if (request !== sessionsRequest) return;
    error("Nu am putut citi orarul grupei", apiErrorMessage(err));
  } finally {
    if (request === sessionsRequest) sessionsLoading.value = false;
  }
});

const confirmAnnounce = async () => {
  if (!announceChildId.value || !announceSessionId.value) {
    error("Alege copilul și ora", "Anunțul e despre o oră anume din orarul grupei lui.");
    return;
  }
  if (announceReason.value.trim().length < 3) {
    error("Scrie motivul", "Familia îl vede în portal, deci nu poate lipsi.");
    return;
  }
  saving.value = true;
  try {
    const saved = await attendanceApi.announceAbsence({
      childId: announceChildId.value,
      classSessionId: announceSessionId.value,
      reason: announceReason.value.trim(),
    });
    announcing.value = false;
    await load(true);
    if (saved.inTime) {
      success("Absența e notată, în termen", "Alege acum ora la care se mută copilul.");
      // The row from the reloaded list, which carries the group the way the list does; the saved
      // one is the fallback for the second it takes the list to catch up.
      void startMove(unplaced.notices.find((notice) => notice.id === saved.id) ?? saved);
    } else {
      success(
        "Absența e notată, după termen",
        "Rămâne consemnată. Dacă familia a sunat la timp și doar noi am întârziat, mutarea e tot pe listă."
      );
    }
  } catch (err: unknown) {
    error("Nu s-a putut nota absența", apiErrorMessage(err));
  } finally {
    saving.value = false;
  }
};

// Moving
const moving = ref(false);
const options = ref<ReplacementOption[]>([]);
const optionsLoading = ref(false);
const optionsError = ref("");
const selectedSessionId = ref<number | null>(null);
const optionsByDay = computed(() => groupOptionsByDay(options.value));

const loadOptions = async (notice: AbsenceNotice) => {
  optionsLoading.value = true;
  optionsError.value = "";
  try {
    options.value = await attendanceApi.fetchReplacementOptions(notice.id);
  } catch (err: unknown) {
    optionsError.value = apiErrorMessage(err, "Nu am putut citi orele săptămânii");
  } finally {
    optionsLoading.value = false;
  }
};

const startMove = async (notice: AbsenceNotice) => {
  target.value = notice;
  options.value = [];
  selectedSessionId.value = null;
  moving.value = true;
  await loadOptions(notice);
};

const confirmMove = async () => {
  const notice = target.value;
  if (!notice || !selectedSessionId.value) {
    error("Alege o oră", "Copilul se mută la una dintre orele din listă.");
    return;
  }
  saving.value = true;
  try {
    await attendanceApi.placeReplacement(notice.id, selectedSessionId.value);
    success("Copilul a fost mutat", "Familia primește un email cu grupa, ziua, ora și adresa.");
    moving.value = false;
    await load(true);
  } catch (err: unknown) {
    error("Nu s-a putut muta", apiErrorMessage(err));
    // The seat may have gone between reading the list and pressing the button; ask again rather
    // than offering the same class twice.
    await loadOptions(notice);
  } finally {
    saving.value = false;
  }
};

// Clearing
const clearing = ref(false);

const askClear = (notice: AbsenceNotice) => {
  target.value = notice;
  clearing.value = true;
};

const confirmClear = async () => {
  if (!target.value) return;
  saving.value = true;
  try {
    await attendanceApi.clearReplacement(target.value.id);
    success(
      "Mutarea a fost anulată",
      "Copilul e din nou pe lista de mutat. Nimeni n-a fost scris."
    );
    clearing.value = false;
    await load(true);
  } catch (err: unknown) {
    error("Nu s-a putut anula mutarea", apiErrorMessage(err));
  } finally {
    saving.value = false;
  }
};

// Withdrawing
const withdrawing = ref(false);

const askWithdraw = (notice: AbsenceNotice) => {
  target.value = notice;
  withdrawing.value = true;
};

const confirmWithdraw = async () => {
  if (!target.value) return;
  saving.value = true;
  try {
    await attendanceApi.withdrawAbsence(target.value.id);
    success("Anunțul a fost retras", "Copilul e așteptat la ora lui.");
    withdrawing.value = false;
    await load(true);
  } catch (err: unknown) {
    error("Nu s-a putut retrage anunțul", apiErrorMessage(err));
  } finally {
    saving.value = false;
  }
};

onMounted(() => load());
</script>
