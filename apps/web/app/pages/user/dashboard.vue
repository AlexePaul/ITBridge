<template>
  <div class="portal-page">
    <div class="portal-head">
      <span class="kicker">Portalul familiei</span>
      <h1 class="portal-title">{{ greeting }}</h1>
    </div>

    <AccountStatusNotice />

    <p v-if="loading" class="portal-empty">Se încarcă…</p>

    <div v-else-if="loadError" class="portal-card portal-card-accent portal-notice" role="alert">
      <p class="body-text">{{ loadError }}</p>
    </div>

    <template v-else>
      <!--
        Money first, and only when there is some owed. The family's bill is not a per-child fact —
        one invoice covers the household — so it sits above the children rather than being repeated
        under each of them.
      -->
      <div v-if="unpaid.length > 0" class="portal-card portal-card-accent portal-notice">
        <span class="portal-label">De plătit</span>
        <div v-for="invoice in unpaid" :key="invoice.id" class="body-text">
          Factura pe {{ formatMonth(invoice.monthIssued) }} —
          <strong class="tnum">{{ formatLei(invoice.amount) }}</strong>
          <template v-if="invoice.status === 'overdue'"> · scadența a trecut</template>
        </div>
        <NuxtLink to="/user/payments" class="btn btn-primary home-action">Vezi facturile</NuxtLink>
      </div>

      <p v-if="children.length === 0" class="portal-empty">
        Încă nu e niciun copil înscris. Alegem împreună grupa potrivită — te sunăm noi, sau ne scrii
        tu la <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
        >.
      </p>

      <!--
        Every child, one under the other, with nothing to switch between.
        This is the one screen in the portal that deliberately has no child switcher: it exists to
        answer "is everything fine?" in a glance, and an answer that is only true for the child on
        the selected tab is not an answer. Absențe and Proiecte switch, because there the parent is
        already reading about one child in depth.
      -->
      <section v-for="row in childRows" :key="row.child.id" class="portal-section child-block">
        <div class="child-head">
          <h2 class="portal-card-figure child-name">
            {{ row.child.firstName }} {{ row.child.lastName }}
          </h2>
          <span v-if="row.child.group" class="child-group">{{ row.child.group.name }}</span>
        </div>

        <div class="portal-grid child-columns">
          <div>
            <span class="portal-label">{{ row.child.firstName }} · următoarea oră</span>
            <template v-if="row.next">
              <p class="portal-when next-when">
                {{ weekdayOf(row.next.date) }}, {{ formatDateKey(row.next.date) }} ·
                {{ formatTime(row.next.startTime) }}–{{ formatTime(row.next.endTime) }}
              </p>
              <p class="portal-where">{{ placeOf(row.next) }}</p>
            </template>
            <p v-else-if="!row.child.group" class="portal-empty">
              {{ row.child.firstName }} nu e încă într-o grupă, deci nu are ore în orar.
            </p>
            <p v-else class="portal-empty">
              Nu e nicio oră în orar deocamdată. Apare aici imediat ce o programăm.
            </p>
          </div>

          <div>
            <span class="portal-label">{{ row.child.firstName }} · prezența recentă</span>
            <template v-if="row.marks.length > 0">
              <div class="marks recent-marks">
                <span v-for="mark in row.marks" :key="mark.id" class="mark">
                  <span class="mark-glyph" :class="{ 'mark-glyph-quiet': mark.quiet }">
                    {{ mark.glyph }}
                  </span>
                  {{ formatDateKey(mark.date) }}
                </span>
              </div>
              <!-- The glyph carries the meaning; the legend spells it out, so nothing here
                   depends on telling two colours apart. -->
              <p class="note">✓ prezent · A absent · R recuperare</p>
              <!-- Four marks is a glance. The month, for the parent who wants one, is a page. -->
              <p class="note">
                <NuxtLink
                  :to="{ path: '/user/prezenta', query: { copil: String(row.child.id) } }"
                  class="link"
                >
                  Vezi luna întreagă →
                </NuxtLink>
              </p>
            </template>
            <p v-else class="portal-empty">
              Încă nu există prezențe de arătat pentru {{ row.child.firstName }}.
            </p>
          </div>

          <div>
            <span class="portal-label">{{ row.child.firstName }} · de rezolvat</span>
            <template v-if="row.todos.length > 0">
              <p v-for="todo in row.todos" :key="todo.key" class="body-text todo">
                <span class="marker" aria-hidden="true">—</span>
                {{ todo.text }}
                <NuxtLink :to="todo.to" class="link">{{ todo.cta }}</NuxtLink>
              </p>
            </template>
            <p v-else class="portal-empty">Nimic de rezolvat.</p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatDateKey, formatLei, formatMonth } from "~/composables/useAdminFormat";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import { useAttendanceStore } from "~/stores/attendanceStore";
import { useChildrenStore } from "~/stores/childrenStore";
import { useProfileStore } from "~/stores/profileStore";
import { AttendanceType } from "~/types/attendance.types";
import type { MakeUpCredit } from "~/types/attendance.types";
import type { Child } from "~/types/child.types";
import type { ClassSession, ClassSessionWithAttendance } from "~/types/class-session.types";
import { SessionStatus } from "~/types/class-session.types";
import type { Invoice } from "~/types/invoice.types";
import type { Project } from "~/types/project.types";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

/**
 * Acasă — the landing screen of the parent portal. E18/S4, screen 1.
 *
 * It took over the route from the month calendar, which now has its own page at `/user/prezenta`.
 * The calendar answers "which days did my child attend?", a question a parent asks a few times a
 * year; this screen answers "is everything fine?", the one they open the portal to ask, and the
 * recent-attendance column links across for anybody who wants the month. Three columns per child —
 * the next class, the last few marks, and anything waiting on them — and every column says in words
 * when it has nothing, because an empty column and a column that failed to load look identical.
 *
 * **No number here is invented.** In particular there is no due date on the invoice card: the
 * fourteen-day term lives in `arrears.rules.ts` on the server and is not on the wire for a parent,
 * and a second copy of that rule on this side would be the copy that goes out of date. The status
 * the API already publishes — pending or overdue — says what the parent needs to act on.
 */
definePageMeta({
  layout: "portal" as any,
  title: "Acasă",
});

const childrenApi = useChildrenApi();
const classSessionsApi = useClassSessionsApi();
const attendanceApi = useAttendanceApi();
const invoiceApi = useInvoiceApi();
const projectsApi = useProjectsApi();

const attendanceStore = useAttendanceStore();
const childrenStore = useChildrenStore();
const profileStore = useProfileStore();

const loading = ref(true);
const loadError = ref("");

const sessionsByGroup = ref<Record<number, ClassSessionWithAttendance[]>>({});
const credits = ref<MakeUpCredit[]>([]);
const invoices = ref<Invoice[]>([]);
const projects = ref<Project[]>([]);

const today = todayKey();

/** How recently a project has to have been done to still count as news on this screen. */
const NEW_PROJECT_DAYS = 30;

/** The last few classes, not the whole term: this is a glance, not the attendance page. */
const RECENT_MARKS = 4;

const children = computed(() => childrenStore.children);

const greeting = computed(() => {
  const first = profileStore.profile?.firstName;
  return first ? `Bună, ${first}` : "Portalul familiei";
});

const unpaid = computed(() =>
  invoices.value.filter((invoice) => invoice.status === "pending" || invoice.status === "overdue")
);

/**
 * Each child's three columns, assembled once per change rather than per render.
 *
 * The template used to call `nextSessionFor`, `recentMarksFor` and `todosFor` directly, and Vue
 * re-runs a method call on every render — so a family of three re-filtered and re-sorted eight
 * weeks of timetable a dozen times for one repaint. A computed caches until its sources change.
 */
const childRows = computed(() =>
  children.value.map((child) => ({
    child,
    next: nextSessionFor(child),
    marks: recentMarksFor(child),
    todos: todosFor(child),
  }))
);

onMounted(async () => {
  try {
    const mine = await childrenApi.fetchChildren();

    /**
     * Everything else is optional furniture around the children.
     *
     * `allSettled`, so one endpoint being down costs its own column and not the page: a parent whose
     * projects service is unavailable should still be told when the next class is.
     */
    await Promise.allSettled([
      loadSessions(mine),
      Promise.all(mine.map((child) => childrenApi.fetchChildrenAttendance(child.id))),
      attendanceApi.fetchMakeUpCredits().then((rows) => (credits.value = rows)),
      invoiceApi.fetchInvoices().then(() => (invoices.value = invoiceApi.getInvoices())),
      projectsApi.fetchProjects().then((rows) => (projects.value = rows)),
    ]);
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca portalul. Încearcă din nou.");
  } finally {
    loading.value = false;
  }
});

/** One request per distinct group, not per child: siblings in the same group share a timetable. */
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

/**
 * The next class that is actually going to happen.
 *
 * Cancelled ones are skipped rather than shown greyed out: this column has room for one class, and
 * the useful one is the next class the child is expected at.
 */
const nextSessionFor = (child: Child): ClassSessionWithAttendance | null => {
  if (!child.group) return null;
  const sessions = sessionsByGroup.value[child.group.id] ?? [];
  return (
    sessions
      .filter((session) => session.date >= today && session.status !== SessionStatus.CANCELLED)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0] ??
    null
  );
};

/**
 * The weekday of a `YYYY-MM-DD`, named.
 *
 * Built from the string's own components and `Date.UTC`, never from `new Date(dateKey)`: an ISO date
 * string parses as UTC midnight, and the school is east of Greenwich, so the plain constructor comes
 * back a day early. `getWeekdayName` wants an ISO weekday — Monday 1 through Sunday 7 — while
 * `getUTCDay` counts Sunday 0 through Saturday 6.
 */
const weekdayOf = (dateKey: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return "";
  const [, year, month, day] = match;
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return getWeekdayName(((utc.getUTCDay() + 6) % 7) + 1);
};

/** Where a class is: the room, then the street it is on. */
const placeOf = (session: ClassSession): string => {
  const room = session.room;
  if (!room) return "";
  const location = room.location;
  if (!location) return room.name;
  return `${room.name} · ${location.street} — ${location.name}`;
};

interface Mark {
  id: number;
  date: string;
  glyph: string;
  quiet: boolean;
}

/**
 * The last few marks, oldest first.
 *
 * Only classes somebody actually took a register for. A session with no record is not an absence —
 * it is paperwork the school has not done — and printing it as one is the exact lie the calendar
 * this screen replaced was rewritten to stop telling.
 */
const recentMarksFor = (child: Child): Mark[] =>
  attendanceStore
    .attendancesByChildId(child.id)
    .filter((record) => record.classSession?.date && record.classSession.date <= today)
    .sort((a, b) => b.classSession.date.localeCompare(a.classSession.date))
    .slice(0, RECENT_MARKS)
    .reverse()
    .map((record) => ({
      id: record.id,
      date: record.classSession.date,
      glyph: !record.present ? "A" : record.type === AttendanceType.MAKE_UP ? "R" : "✓",
      quiet: !record.present,
    }));

interface Todo {
  key: string;
  text: string;
  cta: string;
  to: string;
}

/** What is waiting on the parent for this child — and nothing that is merely true about them. */
const todosFor = (child: Child): Todo[] => {
  const items: Todo[] = [];

  for (const credit of credits.value) {
    if (credit.child.id !== child.id || credit.status !== "available") continue;
    items.push({
      key: `credit-${credit.id}`,
      text: `Un credit de recuperare expiră pe ${formatDateKey(credit.expiresOn)}.`,
      cta: "Alege o oră →",
      to: "/user/absente",
    });
  }

  const project = newestProjectFor(child);
  if (project) {
    items.push({
      key: `project-${project.id}`,
      text: `Proiect nou: „${project.title}", din ${formatDateKey(project.capturedOn)}.`,
      cta: "Vezi proiectul →",
      to: "/user/proiecte",
    });
  }

  return items;
};

/** The child's most recent project, if it is recent enough to still be news. */
const newestProjectFor = (child: Child): Project | null => {
  const newest = projects.value
    .filter((project) => project.child.id === child.id)
    .sort((a, b) => b.capturedOn.localeCompare(a.capturedOn))[0];
  if (!newest) return null;
  return newest.capturedOn >= daysAgo(NEW_PROJECT_DAYS) ? newest : null;
};

/** `YYYY-MM-DD`, n days back. The instant is moved and then formatted, never the text. */
const daysAgo = (days: number): string => {
  const [year, month, day] = today.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day! - days));
  return utc.toISOString().slice(0, 10);
};
</script>

<style scoped>
.home-action {
  align-self: flex-start;
  min-height: 44px;
  margin-top: var(--space-2);
}

.child-block {
  margin-top: var(--rhythm-3);
  padding-top: var(--rhythm-2);
}

.child-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.child-name {
  font-size: 30px;
  line-height: 1.1;
}

/* The group's name, as a bordered tag rather than a filled badge — colour is stroke in this
   system, never fill. */
.child-group {
  padding: 3px var(--space-2);
  border: 1px solid var(--color-accent);
  border-radius: var(--radius-sm);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--color-accent-ink);
}

.child-columns {
  margin-top: var(--rhythm-1);
}

.next-when {
  margin-top: var(--space-3);
}

.recent-marks {
  margin-top: var(--space-3);
}

.todo {
  margin-top: var(--space-3);
}
</style>
