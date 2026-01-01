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
          <UChip
            :show="!!getColorByDate(day.toDate('UTC'), child)"
            :color="getColorByDate(day.toDate('UTC'), child)"
            size="sm"
          >
            {{ day.day }}
          </UChip>
        </template>
      </UCalendar>
      <ul class="list-disc list-inside my-4 text-muted text-xs border-t pt-2">
        <li><strong class="text-success">Verde:</strong> Copilul a fost prezent în acea zi.</li>
        <li><strong class="text-error">Roșu:</strong> Copilul a fost absent în acea zi.</li>
        <li>
          <strong class="text-info">Albastru:</strong> Copilul a participat la o recuperare în acea
          zi.
        </li>
        <li>
          <strong class="text-neutral">Alb/Negru:</strong> Reprezinta o ora planificata în viitor.
        </li>
      </ul>
      <p class="text-muted text-xs">
        Notă: Dacă observați discrepanțe în situația școlară a copilului dvs., vă rugăm să
        contactați administrația școlii pentru clarificări. De asemenea, vacantele scoalare nu sunt
        marcate în calendar.
      </p>
    </UCard>
  </div>
</template>
<script setup lang="ts">
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useUserStore } from "~/stores/userStore";
import { onMounted } from "vue";

const userStore = useUserStore();
const childrenApi = useChildrenApi();
const attendanceStore = useAttendanceStore();

import { computed } from "vue";
import { useAttendanceStore } from "~/stores/attendanceStore";

const childrenList = computed(() => childrenApi.getChildren());

definePageMeta({
  layout: "default" as any,
  middleware: "auth" as any,
});

onMounted(async () => {
  await childrenApi.fetchChildren();
  for (const child of childrenList.value) await childrenApi.fetchChildrenAttendance(child.id);
});

function getColorByDate(date: Date, child: any) {
  if (!child.group) return undefined;

  const dayOfWeek = date.getUTCDay() + 1; // 1 (Sunday) to 7 (Saturday)
  const attendanceRecordForDate = attendanceStore.attendancesByChildIdAndDate(child.id, date);
  console.log("Attendance Record for", date.toDateString(), ":", attendanceRecordForDate);
  if (child.group.weekday === dayOfWeek) {
    if (date > new Date()) {
      return "neutral";
    } else if (attendanceRecordForDate && attendanceRecordForDate.present) {
      return "success";
    } else {
      return "error";
    }
  } else if (attendanceRecordForDate?.present) {
    return "info";
  } else {
    return undefined;
  }
}
</script>
