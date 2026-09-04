<template>
  <AdminPage title="Cum stăm" :subtitle="todayLabel" width="xl">
    <template #actions>
      <!-- The overview is today; the reports are the months behind it and the seats around it. -->
      <UButton to="/admin/rapoarte" color="neutral" variant="outline" icon="i-lucide-chart-bar">
        Rapoarte
      </UButton>
    </template>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />

    <template v-else-if="overview">
      <!-- The things that need somebody. Only the ones with a number sit up front; a zero is good
           news and does not deserve the same weight as a problem. -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <NuxtLink
          v-for="tile in tiles"
          :key="tile.label"
          :to="tile.to"
          class="border rounded-lg p-4 transition-colors hover:bg-muted"
          :class="tile.value > 0 ? 'border-warning' : 'border-muted'"
        >
          <p class="text-2xl font-semibold tabular-nums">{{ tile.display }}</p>
          <p class="text-sm text-muted mt-0.5">{{ tile.label }}</p>
          <p v-if="tile.note" class="text-xs text-muted mt-1">{{ tile.note }}</p>
        </NuxtLink>
      </div>

      <!-- Today, because taking the register is the daily act. -->
      <section class="space-y-3">
        <div class="flex items-baseline justify-between gap-3">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">Orele de azi</h2>
          <p v-if="overview.today.total > 0" class="text-sm text-muted tabular-nums">
            {{ overview.today.marked }} din {{ overview.today.total }} marcate
          </p>
        </div>

        <AdminEmpty
          v-if="overview.today.total === 0"
          icon="i-lucide-coffee"
          title="Nicio oră azi"
          description="Orarul nu are nimic programat pentru ziua asta."
        />

        <div v-else class="space-y-2">
          <NuxtLink
            v-for="session in overview.today.sessions"
            :key="session.id"
            to="/admin/attendance/azi"
            class="flex items-center justify-between gap-4 border border-muted rounded-lg p-3 hover:bg-muted transition-colors"
          >
            <div class="min-w-0">
              <p class="font-medium truncate">{{ session.groupName }}</p>
              <p class="text-muted text-sm tabular-nums">
                {{ session.startTime.slice(0, 5) }}–{{ session.endTime.slice(0, 5) }}
                <span v-if="session.locationName"> · {{ session.locationName }}</span>
              </p>
            </div>
            <UBadge
              :color="session.marked ? 'success' : 'neutral'"
              :variant="session.marked ? 'subtle' : 'outline'"
              size="sm"
              class="shrink-0"
            >
              {{ session.marked ? "Marcată" : "Nemarcată" }}
            </UBadge>
          </NuxtLink>
        </div>
      </section>

      <section v-if="overview.groupsNearlyFull.length > 0" class="space-y-3">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
          Grupe aproape pline
        </h2>
        <div class="space-y-2">
          <NuxtLink
            v-for="group in overview.groupsNearlyFull"
            :key="group.groupId"
            :to="`/admin/groups/${group.groupId}/children`"
            class="flex items-center justify-between gap-4 border border-muted rounded-lg p-3 hover:bg-muted transition-colors"
          >
            <div class="min-w-0">
              <p class="font-medium truncate">{{ group.name }}</p>
              <p v-if="group.locationName" class="text-muted text-sm">{{ group.locationName }}</p>
            </div>
            <UBadge :color="group.free === 0 ? 'error' : 'warning'" variant="subtle" size="sm">
              {{ group.free === 0 ? "Plină" : "Un loc liber" }}
              <span class="tabular-nums ml-1">({{ group.taken }}/{{ group.capacity }})</span>
            </UBadge>
          </NuxtLink>
        </div>
      </section>
    </template>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useOverviewApi } from "~/composables/api/useOverviewApi";
import { formatDateKey, formatLei } from "~/composables/useAdminFormat";
import type { Overview } from "~/types/overview.types";

/**
 * „Cum stăm?", în zece secunde — E21/S1.
 *
 * This replaced a placeholder that said it did not know what it was for. Every number comes from
 * the service that owns its question, so nothing here can quietly disagree with the screen it
 * summarises; and every tile links to the screen that acts on it, because a dashboard that only
 * reports is a dashboard people stop opening.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Cum stăm",
});

const overviewApi = useOverviewApi();

const loading = ref(true);
const loadError = ref("");
const overview = ref<Overview | null>(null);

const todayLabel = computed(() => (overview.value ? formatDateKey(overview.value.date) : ""));

/**
 * What the count means, given how long the oldest one has waited — E17/S8.
 *
 * The wording carries the judgement, because the tile has one line for it: "de verificat și trimis"
 * is a task, "cel mai vechi de 4 zile" is a reproach, and the difference is the whole point of
 * having the age at all.
 */
function projectsWaitingNote(oldestDays: number | null): string {
  if (oldestDays === null || oldestDays === 0) return "de verificat și trimis";
  if (oldestDays === 1) return "cel mai vechi de ieri";
  return `cel mai vechi de ${oldestDays} zile`;
}

const tiles = computed(() => {
  const data = overview.value;
  if (!data) return [];
  return [
    {
      label: "Restanțe",
      value: data.arrears.families,
      display: formatLei(data.arrears.outstanding),
      note:
        data.arrears.families === 0
          ? "nimic de urmărit"
          : `${data.arrears.families} ${data.arrears.families === 1 ? "familie" : "familii"}` +
            (data.arrears.over60 > 0 ? ` · ${data.arrears.over60} de sunat` : ""),
      to: "/admin/restante",
    },
    {
      label: "Cataloage nefăcute",
      value: data.unmarkedThisWeek,
      display: String(data.unmarkedThisWeek),
      note: "din ultima săptămână",
      to: "/admin/attendance",
    },
    {
      label: "Conturi în așteptare",
      value: data.pendingApprovals,
      display: String(data.pendingApprovals),
      note: data.pendingApprovals > 0 ? "familii care așteaptă" : undefined,
      to: "/admin/approvals",
    },
    {
      // The age, not just the count — E17/S8. Five uploaded this afternoon is a normal afternoon;
      // one from Tuesday still here on Friday is a document nobody has looked at, and the two are
      // indistinguishable from a number on its own.
      label: "Proiecte netrimise",
      value: data.projectsAwaitingSend,
      display: String(data.projectsAwaitingSend),
      note:
        data.projectsAwaitingSend > 0
          ? projectsWaitingNote(data.projectsAwaitingSendOldestDays)
          : undefined,
      to: "/admin/proiecte",
    },
    {
      // A family that was never reached does not know it, so nobody complains — which is exactly
      // why it needs a number somebody sees.
      label: "Mesaje nelivrate",
      value: data.undeliverableMessages,
      display: String(data.undeliverableMessages),
      note: data.undeliverableMessages > 0 ? "familii neanunțate" : undefined,
      to: "/admin/livrari",
    },
  ];
});

onMounted(async () => {
  try {
    overview.value = await overviewApi.fetchOverview();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea tabloului");
  } finally {
    loading.value = false;
  }
});
</script>
