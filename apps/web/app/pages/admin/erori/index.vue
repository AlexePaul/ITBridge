<template>
  <AdminPage
    title="Erori"
    subtitle="Ce s-a stricat în platformă, unde și de câte ori. Codul de pe ecranul cuiva găsește eroarea aici, cu contul care a întâlnit-o și locul din cod."
    width="xl"
  >
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="load">
      <UFormField label="Cod de pe ecran" class="w-48">
        <UInput v-model="filter.ref" placeholder="ex. 3f2a9c1d" class="w-full" />
      </UFormField>
      <UFormField label="Stare" class="w-44">
        <USelect v-model="filter.state" :items="STATE_ITEMS" class="w-full" />
      </UFormField>
      <UFormField label="Unde" class="w-52">
        <USelect v-model="filter.source" :items="SOURCE_ITEMS" class="w-full" />
      </UFormField>
      <UButton type="submit" variant="subtle" :loading="loading">Caută</UButton>
      <UButton v-if="anyFilter" variant="ghost" color="neutral" @click="clearFilters">
        Curăță
      </UButton>
    </form>
    <p v-if="filter.ref.trim()" class="text-sm text-muted">
      Căutarea după cod se uită și printre erorile rezolvate: cine citește codul de pe ecran nu știe
      dacă a reparat-o cineva între timp.
    </p>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <AdminEmpty
      v-else-if="reports.length === 0"
      icon="i-lucide-shield-check"
      :title="anyFilter ? 'Nicio eroare pentru filtrele astea' : 'Nicio eroare nerezolvată'"
      :description="
        anyFilter
          ? 'Un cod se caută după primele lui caractere; verifică-l cu cel de pe ecran.'
          : 'Când ceva se strică — o cerere, un job, un ecran —, apare aici.'
      "
    />

    <div v-else class="space-y-2">
      <div v-for="report in reports" :key="report.id" class="border border-muted rounded-lg p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-mono text-sm break-all">{{ report.origin }}</p>
            <p class="font-medium mt-1 break-words">{{ report.errorName }}: {{ report.message }}</p>
            <p class="text-muted text-sm mt-1">
              {{ countOf(report.occurrences, "dată", "ori") }} · prima
              {{ formatStamp(report.firstSeenAt) }} · ultima
              {{ formatStamp(report.lastSeenAt) }}
              <template v-if="report.recent[0]?.commit">
                (commit
                <span class="font-mono">{{ shortCommit(report.recent[0].commit) }}</span
                >)
              </template>
              <template v-if="report.resolvedAt">
                · rezolvată {{ formatStamp(report.resolvedAt) }}
              </template>
            </p>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <UBadge :color="SOURCE_COLORS[report.source]" variant="subtle" size="sm">
              {{ ERROR_SOURCE_LABELS[report.source] }}
            </UBadge>
            <span v-if="report.statusCode || report.code" class="text-xs text-muted font-mono">
              {{ [report.statusCode, report.code].filter(Boolean).join(" · ") }}
            </span>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 mt-3">
          <UButton
            variant="ghost"
            size="xs"
            @click="expanded === report.id ? (expanded = null) : (expanded = report.id)"
          >
            {{ expanded === report.id ? "Ascunde detaliile" : "Vezi detaliile" }}
          </UButton>
          <UButton
            v-if="!report.resolvedAt"
            variant="subtle"
            size="xs"
            color="success"
            :loading="resolving === report.id"
            @click="resolve(report.id)"
          >
            Marchează rezolvată
          </UButton>
        </div>
        <p v-if="resolveError && resolveError.id === report.id" class="text-sm text-error mt-2">
          {{ resolveError.message }}
        </p>

        <div v-if="expanded === report.id" class="mt-3 space-y-3">
          <p class="text-sm text-muted border-l-2 border-muted pl-3">
            {{ ERROR_SOURCE_HINTS[report.source] }}
          </p>

          <div>
            <p class="text-sm font-medium mb-1">Aparițiile recente, cele mai noi primele</p>
            <ul class="text-sm space-y-1">
              <li
                v-for="(occurrence, index) in report.recent"
                :key="`${report.id}-${index}`"
                class="flex flex-wrap gap-x-2"
              >
                <span class="tabular-nums">{{ formatStamp(occurrence.at) }}</span>
                <span v-if="occurrence.ref" class="font-mono">
                  cod {{ occurrence.ref.slice(0, 8) }}
                </span>
                <template v-if="occurrence.profileId">
                  ·
                  <NuxtLink
                    :to="`/admin/profiles/${occurrence.profileId}`"
                    class="text-primary underline"
                  >
                    {{ occurrence.familyName || occurrence.username }}
                  </NuxtLink>
                </template>
                <span v-else-if="occurrence.username">· {{ occurrence.username }}</span>
                <span v-else-if="occurrence.userId">· contul #{{ occurrence.userId }}</span>
                <span v-if="occurrence.path" class="text-muted font-mono break-all">
                  · {{ occurrence.path }}
                </span>
                <span v-if="occurrence.commit" class="text-muted">
                  · commit
                  <a
                    :href="commitUrl(occurrence.commit)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-mono underline"
                    >{{ shortCommit(occurrence.commit) }}</a
                  >
                </span>
              </li>
            </ul>
          </div>

          <div v-if="report.stack">
            <p class="text-sm font-medium mb-1">Stack trace</p>
            <pre
              class="text-xs whitespace-pre-wrap break-all font-mono bg-muted/40 rounded p-3 max-h-96 overflow-auto"
              >{{ report.stack }}</pre>
          </div>
        </div>
      </div>
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useErrorsApi } from "~/composables/api/useErrorsApi";
import { useErrorReportsStore } from "~/stores/errorReportsStore";
import type { ErrorReport, ErrorReportState, ErrorSource } from "~/types/error-report.types";
import { ERROR_SOURCE_HINTS, ERROR_SOURCE_LABELS } from "~/types/error-report.types";
import { commitUrl, shortCommit } from "~/types/system.types";

/**
 * The error record — E06 S1.
 *
 * What a 500, a failed job or a broken screen left behind, one row per fault. The code a family
 * reads out from their screen — `?cod=` from the toast, or typed into the field — finds the fault
 * whether or not somebody already marked it fixed. „Marchează rezolvată" says the fix is out; the
 * same fault coming back afterwards opens a new row, because then it is news.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Erori",
});

const errorsApi = useErrorsApi();
const errorReports = useErrorReportsStore();
const route = useRoute();

const SOURCE_COLORS: Record<ErrorSource, "error" | "warning" | "info"> = {
  request: "error",
  logged: "warning",
  browser: "info",
};

// A sentinel instead of `""`: reka-ui refuses an empty value, and the select could not go back to
// „everything" once a choice was made (CLAUDE.md).
const STATE_ITEMS: { label: string; value: ErrorReportState }[] = [
  { label: "Nerezolvate", value: "open" },
  { label: "Rezolvate", value: "resolved" },
  { label: "Toate", value: "all" },
];
const SOURCE_ITEMS: { label: string; value: ErrorSource | "all" }[] = [
  { label: "Oriunde", value: "all" },
  { label: ERROR_SOURCE_LABELS.request, value: "request" },
  { label: ERROR_SOURCE_LABELS.logged, value: "logged" },
  { label: ERROR_SOURCE_LABELS.browser, value: "browser" },
];

const loading = ref(true);
const loadError = ref("");
const reports = ref<ErrorReport[]>([]);
const expanded = ref<number | null>(null);
const resolving = ref<number | null>(null);
const resolveError = ref<{ id: number; message: string } | null>(null);

const queryCode = typeof route.query.cod === "string" ? route.query.cod : "";
const filter = reactive<{ ref: string; state: ErrorReportState; source: ErrorSource | "all" }>({
  ref: queryCode,
  state: "open",
  source: "all",
});

const anyFilter = computed(
  () => Boolean(filter.ref.trim()) || filter.state !== "open" || filter.source !== "all"
);

/** `27 sept. 2026, 16:05`, on the school's clock whatever the computer's. */
const formatStamp = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Bucharest",
  });

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const [list, summary] = await Promise.all([
      errorsApi.fetchErrors({
        state: filter.state,
        source: filter.source === "all" ? undefined : filter.source,
        ref: filter.ref.trim() || undefined,
      }),
      errorsApi.fetchErrorSummary(),
    ]);
    reports.value = list;
    errorReports.setOpen(summary.open);
    // The one a code points at is the one the reader came for: open it.
    if (filter.ref.trim() && list.length === 1) expanded.value = list[0]!.id;
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca erorile.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const clearFilters = () => {
  filter.ref = "";
  filter.state = "open";
  filter.source = "all";
  void load();
};

const resolve = async (id: number) => {
  resolving.value = id;
  resolveError.value = null;
  try {
    const updated = await errorsApi.resolveError(id);
    // Out of the open list at once; kept, with its day, anywhere else.
    reports.value =
      filter.state === "open" && !filter.ref.trim()
        ? reports.value.filter((report) => report.id !== id)
        : reports.value.map((report) => (report.id === id ? updated : report));
    errorReports.setOpen((await errorsApi.fetchErrorSummary()).open);
  } catch (err: unknown) {
    resolveError.value = {
      id,
      message: apiErrorMessage(err, "Nu am putut marca eroarea ca rezolvată."),
    };
  } finally {
    resolving.value = null;
  }
};
</script>
