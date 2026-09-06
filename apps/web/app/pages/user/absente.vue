<template>
  <div class="portal-page">
    <div class="portal-head">
      <span class="kicker">Portalul familiei</span>
      <h1 class="portal-title">Absențe și recuperări</h1>
      <!--
        The deadline and the way to meet it, in one sentence rather than a paragraph. The rule is
        frozen on the server when a notice is written (`inTime`), so this describes it rather than
        being a second copy of it. It has now changed twice — first from "before the class starts"
        to Monday noon, then from a button on this page to a phone call — and the sentence a parent
        reads is the one thing that must never lag the rule behind it.
      -->
      <p class="lede measure-wide">
        Anunță-ne până <strong>luni la 12:00</strong> — la telefon, pe WhatsApp sau pe email — și
        mutăm copilul la altă grupă în aceeași săptămână. Anunțată mai târziu, ora nu se mai
        recuperează în săptămâna aceea.
      </p>
      <p class="lede measure-wide">
        Ne găsești la <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
        >. Noi notăm absența și tot noi îți spunem aici unde l-am mutat.
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
      <!--
        The moves, first and in cards, because this is the only part of the screen a parent has to
        act on: a different room, on a different day, for one week. Everything else here is a
        record.
      -->
      <section class="portal-section">
        <h2 class="portal-label">{{ scopeLabel }} · mutări în această perioadă</h2>

        <p v-if="visibleMoves.length === 0" class="portal-empty">
          Nicio mutare deocamdată. Apare aici imediat ce găsim o grupă cu loc liber.
        </p>

        <div v-else class="portal-grid portal-grid-wide moves">
          <div
            v-for="notice in visibleMoves"
            :key="notice.id"
            class="portal-card portal-card-accent"
          >
            <span class="portal-label">Mutat</span>
            <p class="portal-card-title">
              {{ weekdayNameOf(notice.replacementSession!.date) }},
              {{ formatDateKey(notice.replacementSession!.date) }} ·
              {{ formatTime(notice.replacementSession!.startTime) }}
            </p>
            <p class="body-text">
              {{ notice.child.firstName }} merge la
              <strong>{{ notice.replacementSession!.group?.name ?? "altă grupă" }}</strong>
              <template v-if="placeOf(notice.replacementSession!)">
                , {{ placeOf(notice.replacementSession!) }}</template
              >, în locul orei de pe {{ formatDateKey(notice.classSession.date) }}.
            </p>
          </div>
        </div>
      </section>

      <!-- What has been announced, and what came of it. -->
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
              Two facts, and they are separate on purpose. `inTime` is frozen when the notice is
              written, so it says what the announcement earned rather than re-judging a deadline
              that has since passed; the move is what the school did with it, and a notice can be
              in time and still waiting while the office works through the week.
            -->
            <p class="outcome" :class="{ 'outcome-quiet': !notice.inTime }">
              <template v-if="notice.replacementSession">
                Mutat pe {{ formatDateKey(notice.replacementSession.date) }}
              </template>
              <template v-else-if="notice.inTime">Anunțată în termen — căutăm o oră</template>
              <template v-else>Anunțată după termen — fără recuperare</template>
            </p>
          </div>
        </div>
      </section>

      <!-- The timetable, so a parent can see what they would be announcing about. -->
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
          </div>
        </div>
      </section>
    </template>
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
import { formatDateKey } from "~/composables/useAdminFormat";
import { formatTime, weekdayNameOf } from "~/composables/useUtils";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { SessionStatus } from "~/types/class-session.types";
import type { ClassSession, ClassSessionWithAttendance } from "~/types/class-session.types";
import type { AbsenceNotice } from "~/types/attendance.types";
import type { Child } from "~/types/child.types";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

/**
 * Absențe și recuperări — E12/S3 and S4, on the E18/S4 design.
 *
 * **A screen a family reads rather than one they operate**, which is the change E12/S4 made and the
 * reason two thirds of this page went away. There is no make-up credit to hold and no hour to pick:
 * a parent rings, WhatsApps or emails, the office notes the absence and moves the child into
 * another group for that week, and what the family needs from a screen is the answer — which room,
 * which day, which hour.
 *
 * So the announce button is gone (only an admin records an absence, because only an admin answered
 * the phone), the booking dialog is gone with the credit it spent, and „Vine totuși" is gone too:
 * withdrawing an announcement is the same act as making one, and it goes back down the same phone
 * line. What is left is ordered by what a parent does with it — the moves first, because they are
 * the only thing here that asks anything of them.
 */
definePageMeta({
  layout: "portal" as any,
  title: "Absențe și recuperări",
});

const attendanceApi = useAttendanceApi();
const childrenApi = useChildrenApi();
const classSessionsApi = useClassSessionsApi();
const childrenStore = useChildrenStore();
const { includes, isShowingAll, selected, reconcile } = useChildSelection();

const loading = ref(true);
const loadError = ref("");
const notices = ref<AbsenceNotice[]>([]);
const upcoming = ref<{ child: Child; session: ClassSessionWithAttendance; announced: boolean }[]>(
  []
);

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
const visibleNotices = computed(() => notices.value.filter((row) => includes(row.child.id)));
const visibleMoves = computed(() =>
  visibleNotices.value.filter((notice) => notice.replacementSession)
);

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const [fetched] = await Promise.all([childrenApi.fetchChildren(), refreshNotices()]);
    const mine = (fetched ?? (childrenStore.children as Child[])) as Child[];
    reconcile(mine);

    const rows: { child: Child; session: ClassSessionWithAttendance; announced: boolean }[] = [];
    for (const child of mine) {
      if (!child.group) continue;
      const sessions = await classSessionsApi.fetchSessions({ groupId: child.group.id });
      for (const session of sessions) {
        // Only what is still ahead, and not called off.
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

/** Where a class is: the room, then the street it is on. */
const placeOf = (session: ClassSession): string => {
  const room = session.room;
  if (!room) return "";
  const location = room.location;
  if (!location) return room.name;
  return `${room.name} · ${location.street} — ${location.name}`;
};

const isAnnounced = (childId: number, sessionId: number) =>
  notices.value.some(
    (notice) => notice.child.id === childId && notice.classSession.id === sessionId
  );

onMounted(load);
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

.moves {
  margin-top: var(--space-4);
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
</style>
