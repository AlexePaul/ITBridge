<template>
  <div class="w-full max-w-3xl mx-auto px-4 py-6 space-y-8">
    <div>
      <h1 class="text-3xl font-bold">Anunță o absență</h1>
      <p class="text-muted mt-1">
        Dacă știi dinainte că cel mic nu ajunge la o oră, spune-ne de aici. Profesorul vede înainte
        de curs, iar noi nu mai sunăm să întrebăm.
      </p>
    </div>

    <div v-if="loading" class="py-12 text-center text-muted">Se încarcă…</div>
    <UCard v-else-if="loadError" variant="subtle" class="border border-error">
      <p class="font-medium">{{ loadError }}</p>
    </UCard>

    <template v-else>
      <!-- What has already been announced. First, because it is what a returning parent checks. -->
      <section v-if="notices.length > 0" class="space-y-3">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">Anunțate deja</h2>
        <div
          v-for="notice in notices"
          :key="notice.id"
          class="flex items-start justify-between gap-4 border border-muted rounded-lg p-4"
        >
          <div class="min-w-0">
            <p class="font-medium">
              {{ notice.child.firstName }} —
              <span class="tabular-nums">{{ formatDateKey(notice.classSession.date) }}</span
              >, {{ notice.classSession.startTime.slice(0, 5) }}
            </p>
            <p class="text-muted text-sm mt-0.5">{{ notice.reason }}</p>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="withdrawingId === notice.id"
            @click="withdraw(notice)"
          >
            Vine totuși
          </UButton>
        </div>
      </section>

      <section class="space-y-3">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">Orele care urmează</h2>

        <div
          v-if="upcoming.length === 0"
          class="text-center py-12 border border-dashed border-muted rounded-lg space-y-2"
        >
          <UIcon name="i-lucide-calendar-check" class="text-4xl text-muted" />
          <p class="font-medium">Nicio oră programată</p>
          <p class="text-sm text-muted">
            Când apare orarul, orele se vor vedea aici și le poți anunța.
          </p>
        </div>

        <div
          v-for="entry in upcoming"
          :key="`${entry.child.id}-${entry.session.id}`"
          class="flex items-center justify-between gap-4 border border-muted rounded-lg p-4"
          :class="entry.announced && 'opacity-60'"
        >
          <div class="min-w-0">
            <p class="font-medium">{{ entry.child.firstName }} {{ entry.child.lastName }}</p>
            <p class="text-muted text-sm tabular-nums">
              {{ formatDateKey(entry.session.date) }} · {{ entry.session.startTime.slice(0, 5) }}–{{
                entry.session.endTime.slice(0, 5)
              }}
              <span v-if="entry.session.group"> · {{ entry.session.group.name }}</span>
            </p>
          </div>
          <UButton
            v-if="!entry.announced"
            color="primary"
            variant="soft"
            size="sm"
            @click="openAnnounce(entry)"
          >
            Anunță
          </UButton>
          <UBadge v-else color="warning" variant="subtle">Anunțat</UBadge>
        </div>
      </section>
    </template>

    <UModal v-model:open="formOpen" title="Anunță absența">
      <template #body>
        <form id="absence-form" class="space-y-4" @submit.prevent="submit">
          <p v-if="selected" class="text-sm text-muted">
            {{ selected.child.firstName }}, {{ formatDateKey(selected.session.date) }}, ora
            {{ selected.session.startTime.slice(0, 5) }}.
          </p>
          <UFormField
            label="Motivul"
            required
            help="O propoziție e de ajuns. O citește profesorul, nu ajunge nicăieri altundeva."
          >
            <UTextarea
              v-model="reason"
              :rows="3"
              placeholder="Răcit, îl ținem acasă"
              class="w-full"
            />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false">
            Renunță
          </UButton>
          <UButton
            type="submit"
            form="absence-form"
            :loading="saving"
            :disabled="reason.trim().length < 3 || saving"
          >
            Trimite
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useChildrenStore } from "~/stores/childrenStore";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey } from "~/composables/useAdminFormat";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { SessionStatus } from "~/types/class-session.types";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";
import type { AbsenceNotice } from "~/types/attendance.types";
import type { Child } from "~/types/child.types";

/**
 * A parent announcing an absence — E12/S3.
 *
 * The classes still to come, one row each, with a button. Announcing does not mark anybody absent:
 * the register stays the teacher's to take, and a child whose parent announced can turn up anyway.
 * What it buys is that nobody has to phone to ask.
 */
definePageMeta({
  layout: "dashboard" as any,
  title: "Anunță o absență",
});

const attendanceApi = useAttendanceApi();
const childrenApi = useChildrenApi();
const classSessionsApi = useClassSessionsApi();
const childrenStore = useChildrenStore();
const { success, error } = useNotifications();

const loading = ref(true);
const loadError = ref("");
const notices = ref<AbsenceNotice[]>([]);
const upcoming = ref<{ child: Child; session: ClassSessionWithAttendance; announced: boolean }[]>(
  []
);

const formOpen = ref(false);
const saving = ref(false);
const reason = ref("");
const selected = ref<{ child: Child; session: ClassSessionWithAttendance } | null>(null);
const withdrawingId = ref<number | null>(null);

const today = todayKey();

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const [children] = await Promise.all([childrenApi.fetchChildren(), refreshNotices()]);
    const mine = (children ?? (childrenStore.children as Child[])) as Child[];

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

const isAnnounced = (childId: number, sessionId: number) =>
  notices.value.some(
    (notice) => notice.child.id === childId && notice.classSession.id === sessionId
  );

onMounted(load);

const openAnnounce = (entry: { child: Child; session: ClassSessionWithAttendance }) => {
  selected.value = entry;
  reason.value = "";
  formOpen.value = true;
};

const submit = async () => {
  if (!selected.value || reason.value.trim().length < 3) return;
  saving.value = true;
  try {
    await attendanceApi.announceAbsence({
      childId: selected.value.child.id,
      classSessionId: selected.value.session.id,
      reason: reason.value.trim(),
    });
    success("Am notat. Profesorul vede înainte de oră.");
    formOpen.value = false;
    await refreshNotices();
    markAnnounced(selected.value.child.id, selected.value.session.id, true);
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
