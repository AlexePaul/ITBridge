<template>
  <div class="portal-page">
    <div class="portal-head">
      <span class="kicker">Portalul familiei</span>
      <h1 class="portal-title">Prezența</h1>
      <p class="lede measure-wide">
        Lună cu lună, ce s-a întâmplat la fiecare oră. Zilele fără niciun semn sunt zile în care
        grupa nu a avut oră — inclusiv orele anulate.
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
      <p v-if="months.length === 0" class="portal-empty">
        Încă nu e niciun copil înscris, deci nu există prezențe de arătat.
      </p>

      <section v-for="{ child, cells, isEmpty } in months" :key="child.id" class="portal-section">
        <div class="cal-head">
          <h2 class="cal-month">{{ child.firstName }} · {{ monthLabel }}</h2>
          <button
            type="button"
            class="btn btn-secondary btn-icon cal-nav"
            aria-label="Luna anterioară"
            @click="shiftMonth(-1)"
          >
            <UIcon name="i-lucide-chevron-left" class="size-4" />
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-icon cal-nav"
            aria-label="Luna următoare"
            @click="shiftMonth(1)"
          >
            <UIcon name="i-lucide-chevron-right" class="size-4" />
          </button>
        </div>

        <p v-if="!child.group" class="portal-empty">
          {{ child.firstName }} nu e încă într-o grupă, deci nu are ore în orar.
        </p>

        <template v-else>
          <div class="cal">
            <div class="cal-grid">
              <div v-for="name in WEEKDAY_INITIALS" :key="name.key" class="cal-dow">
                <abbr :title="name.full">{{ name.short }}</abbr>
              </div>

              <div
                v-for="cell in cells"
                :key="cell.date"
                class="cal-day"
                :class="{
                  'cal-day-outside': !cell.inMonth,
                  'cal-day-today': cell.date === today,
                }"
              >
                <span>{{ cell.day }}</span>
                <span
                  v-if="cell.mark"
                  class="cal-mark"
                  :class="{ 'cal-mark-quiet': cell.mark.quiet }"
                  :aria-label="cell.mark.label"
                  :title="cell.mark.label"
                >
                  {{ cell.mark.glyph }}
                </span>
              </div>
            </div>

            <!--
              Every glyph, spelled out. The system has one accent and no semantic palette, so the
              marks are told apart by shape rather than by hue — which is also what makes the month
              readable to somebody who does not separate colours.
            -->
            <p class="cal-legend">
              <span v-for="entry in LEGEND" :key="entry.glyph">
                <span class="cal-mark" :class="{ 'cal-mark-quiet': entry.quiet }">
                  {{ entry.glyph }}
                </span>
                {{ entry.label }}
              </span>
            </p>
          </div>

          <p v-if="isEmpty" class="portal-empty">În {{ monthLabel }} nu a avut nicio oră.</p>
        </template>
      </section>

      <p class="note contact-note">
        Dacă vezi ceva ce nu se potrivește, scrie-ne sau sună la
        <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
        >. „Nemarcat" înseamnă că profesorul nu a completat încă catalogul — nu că a lipsit copilul.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useChildSelection } from "~/composables/useChildSelection";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { apiErrorMessage } from "~/composables/useApiError";
import {
  calendarDayState,
  monthGrid,
  todayKey,
  type CalendarDayState,
  type MonthCell,
} from "~/composables/useAttendanceCalendar";
import { useAttendanceStore } from "~/stores/attendanceStore";
import { useChildrenStore } from "~/stores/childrenStore";
import type { Child } from "~/types/child.types";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

/**
 * Prezența — the month view, E18/S4.
 *
 * A page of its own rather than a block on Acasă. Acasă exists to answer "is everything fine?" in a
 * glance, and a 42-cell grid with a five-item legend, once per child, is the opposite of a glance —
 * on a 390px phone it would push everything that actually needs attention below the fold. This is a
 * screen a parent opens on purpose, once in a while, so it can afford the room.
 *
 * The decision about what a day *means* is not here: `calendarDayState` owns it, as a pure function
 * over the child's marks and their group's timetable. That is deliberate and hard-won — the version
 * this replaces guessed from `Group.weekday` and told every parent their child had been absent from
 * every Monday since the group was created, holidays and pre-enrolment months included. This file
 * only draws what that function returns.
 *
 * The five states are drawn as **glyphs**, not as the five Nuxt UI colours the old screen used. The
 * classical system has one accent and no semantic palette, and a month told apart only by green
 * against red is a month somebody with a colour deficiency cannot read.
 */
definePageMeta({
  layout: "portal" as any,
  title: "Prezența",
});

const childrenApi = useChildrenApi();
const classSessionsApi = useClassSessionsApi();
const attendanceStore = useAttendanceStore();
const childrenStore = useChildrenStore();
const { includes, reconcile } = useChildSelection();

const loading = ref(true);
const loadError = ref("");
const sessionsByGroup = ref<Record<number, ClassSessionWithAttendance[]>>({});

const today = todayKey();

/** The month on screen, as `{ year, month }` with `month` 1-based. Starts on today's. */
const cursor = ref({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });

const MONTHS = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

/** Monday first, as a Romanian calendar is read. */
const WEEKDAY_INITIALS = [
  { key: 1, short: "L", full: "luni" },
  { key: 2, short: "Ma", full: "marți" },
  { key: 3, short: "Mi", full: "miercuri" },
  { key: 4, short: "J", full: "joi" },
  { key: 5, short: "V", full: "vineri" },
  { key: 6, short: "S", full: "sâmbătă" },
  { key: 7, short: "D", full: "duminică" },
];

interface Mark {
  glyph: string;
  label: string;
  quiet: boolean;
}

/**
 * One glyph per state. `present`, `absent` and `make-up` are the same three the recent-attendance
 * row on Acasă uses, so the two screens do not teach two vocabularies for one fact.
 */
const MARKS: Record<CalendarDayState, Mark> = {
  present: { glyph: "✓", label: "prezent", quiet: false },
  absent: { glyph: "A", label: "absent", quiet: false },
  "make-up": { glyph: "R", label: "recuperare", quiet: false },
  unmarked: { glyph: "?", label: "nemarcat de profesor", quiet: true },
  planned: { glyph: "○", label: "oră programată", quiet: true },
};

const LEGEND = Object.values(MARKS);

const children = computed(() => childrenStore.children);
const visibleChildren = computed(() => children.value.filter((child) => includes(child.id)));

const monthLabel = computed(() => `${MONTHS[cursor.value.month - 1]} ${cursor.value.year}`);

const shiftMonth = (delta: number) => {
  const next = cursor.value.month + delta;
  if (next < 1) cursor.value = { year: cursor.value.year - 1, month: 12 };
  else if (next > 12) cursor.value = { year: cursor.value.year + 1, month: 1 };
  else cursor.value = { year: cursor.value.year, month: next };
};

interface Cell extends MonthCell {
  mark: Mark | null;
}

/**
 * The month's grid for one child: the geometry from `monthGrid`, each day carrying its mark.
 *
 * The date arithmetic is deliberately not here — it lives with the rest of this app's date handling
 * in `useAttendanceCalendar`, where it is tested. What is left is the lookup.
 */
const cellsFor = (child: Child): Cell[] => {
  const attendance = attendanceStore.attendancesByChildId(child.id);
  const sessions = child.group ? (sessionsByGroup.value[child.group.id] ?? []) : [];

  return monthGrid(cursor.value.year, cursor.value.month).map((cell) => {
    const state = calendarDayState({ date: cell.date, today, attendance, sessions });
    return { ...cell, mark: state ? MARKS[state] : null };
  });
};

/**
 * One month per visible child, built once per change rather than per render.
 *
 * A method called from the template re-runs on every render, and this one builds 42 dates and walks
 * the child's whole attendance list for each of them — twice over, since the empty-month sentence
 * asks the same question again.
 */
const months = computed(() =>
  visibleChildren.value.map((child) => {
    const cells = cellsFor(child);
    return {
      child,
      cells,
      // Said in words rather than left blank: an empty grid and a grid that failed to load look the
      // same.
      isEmpty: cells.every((cell) => !cell.inMonth || !cell.mark),
    };
  })
);

onMounted(async () => {
  try {
    const mine = await childrenApi.fetchChildren();
    reconcile(mine);

    await Promise.all([
      ...mine.map((child) => childrenApi.fetchChildrenAttendance(child.id)),
      loadSessions(mine),
    ]);
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca prezența.");
  } finally {
    loading.value = false;
  }
});

/**
 * One request per distinct group, not per child.
 *
 * No date filter, and none is needed for the past: a month before the timetable's horizon is drawn
 * from the child's own attendance records, which carry their session with them. That is also why
 * `calendarDayState` checks the record before the timetable.
 */
const loadSessions = async (mine: Child[]) => {
  const groupIds = [
    ...new Set(mine.map((child) => child.group?.id).filter((id): id is number => id !== undefined)),
  ];
  await Promise.all(
    groupIds.map(async (groupId) => {
      sessionsByGroup.value[groupId] = await classSessionsApi.fetchSessions({ groupId });
    })
  );
};
</script>

<style scoped>
.switcher-slot {
  margin-top: var(--rhythm-2);
}

.cal-nav {
  width: 44px;
  height: 44px;
}

.contact-note {
  margin-top: var(--rhythm-2);
  max-width: 58ch;
}
</style>
