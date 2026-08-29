<template>
  <h1 class="text-4xl font-bold text-center mt-12 mb-6">Situație Școlară</h1>
  <div
    class="grid flex-1 mx-auto gap-6 w-full max-w-4xl grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(320px,1fr))] px-4 sm:px-6 lg:px-8 place-content-start justify-items-center justify-center pb-16"
  >
    <UCard
      v-for="child in childrenList"
      :key="child.id"
      class="mx-auto my-4 border rounded-lg p-4 w-full h-full"
      variant="subtle"
    >
      <h2 class="text-2xl font-semibold mb-2 text-secondary">
        {{ child.firstName }} {{ child.lastName }}
      </h2>
      <UCalendar
        :events="[]"
        class="mt-4"
        :initial-view="'month'"
        :height="'auto'"
        :year-controls="false"
        color="primary"
      >
        <template #day="{ day }">
          <UChip :show="!!dayColor(day, child)" :color="dayColor(day, child)" size="sm">
            {{ day.day }}
          </UChip>
        </template>
      </UCalendar>
      <ul class="list-disc list-inside my-4 text-muted text-xs border-t pt-2">
        <li><strong class="text-success">Verde:</strong> Copilul a fost prezent în acea zi.</li>
        <li><strong class="text-error">Roșu:</strong> Copilul a fost absent în acea zi.</li>
        <li>
          <strong class="text-warning">Galben:</strong> Copilul a participat la o recuperare în acea
          zi.
        </li>
        <li>
          <strong class="text-info">Albastru:</strong> A avut loc o oră, dar prezența încă nu a fost
          marcată de profesor. Nu înseamnă că a lipsit copilul.
        </li>
        <li>
          <strong class="text-neutral">Alb/Negru:</strong> Reprezintă o oră planificată în viitor.
        </li>
        <li>
          Zilele fără niciun punct sunt zile în care grupa nu a avut oră, inclusiv orele anulate.
        </li>
      </ul>
      <p class="text-muted text-xs">
        Notă: Dacă observați discrepanțe în situația școlară a copilului dvs., vă rugăm să
        contactați administrația școlii pentru clarificări.
      </p>
    </UCard>
  </div>
</template>
<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import {
  calendarDayColor,
  toDateKey,
  todayKey,
  type CalendarDayParts,
} from "~/composables/useAttendanceCalendar";
import { useAttendanceStore } from "~/stores/attendanceStore";
import { useChildrenStore } from "~/stores/childrenStore";
import { useClassSessionStore } from "~/stores/classSessionStore";
import type { Child } from "~/types/child.types";

const childrenApi = useChildrenApi();
const classSessionsApi = useClassSessionsApi();
const attendanceStore = useAttendanceStore();
const childrenStore = useChildrenStore();
const classSessionStore = useClassSessionStore();

const childrenList = computed(() => childrenStore.children);

definePageMeta({
  layout: "dashboard" as any,
  title: "Situație Școlară",
});

onMounted(async () => {
  await childrenApi.fetchChildren();

  await Promise.all(
    childrenList.value.map((child) => childrenApi.fetchChildrenAttendance(child.id))
  );

  // One request per distinct group, not per child: siblings in the same group share a timetable.
  const groupIds = new Set(
    childrenList.value
      .map((child) => child.group?.id)
      .filter((id): id is number => id !== undefined)
  );
  await Promise.all([...groupIds].map((groupId) => classSessionsApi.fetchGroupSessions(groupId)));
});

/**
 * Recomputed once per render rather than per day, so a calendar with 42 cells does not build 42
 * dates. It does not tick over midnight, which is fine: nothing on this screen changes at 00:00
 * that a reload will not pick up.
 */
const today = computed(() => todayKey());

/**
 * The colour of one calendar cell.
 *
 * The decision itself lives in `useAttendanceCalendar`, as a pure function over the child's marks
 * and their group's timetable - which is what makes it testable, and what stopped it from guessing
 * a class into existence out of `group.weekday`.
 */
function dayColor(day: CalendarDayParts, child: Child) {
  return calendarDayColor({
    date: toDateKey(day),
    today: today.value,
    attendance: attendanceStore.attendancesByChildId(child.id),
    sessions: child.group ? classSessionStore.sessionsByGroupId(child.group.id) : [],
  });
}
</script>
