<template>
  <AdminPage
    title="Restanțe"
    subtitle="Facturile neachitate, cele mai vechi primele. Se calculează din plățile încasate, deci o familie dispare de aici în clipa în care plătește."
    width="xl"
  >
    <template #actions>
      <UBadge v-if="rows.length > 0" color="neutral" variant="subtle" size="lg">
        {{ formatLei(totalOutstanding) }} în total
      </UBadge>
    </template>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <AdminEmpty
      v-else-if="rows.length === 0"
      icon="i-lucide-check-check"
      title="Nicio restanță"
      description="Toate facturile emise sunt achitate sau încă în termen."
    />

    <template v-else>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AdminStatTile
          v-for="band in buckets"
          :key="band"
          :value="bandCount(band)"
          :label="ARREARS_BUCKET_LABELS[band]"
        />
      </div>

      <AdminSearchInput
        v-model="query"
        label="Caută familia"
        placeholder="Caută după numele familiei"
        icon="i-lucide-search"
      />
      <p v-if="query && matching.length === 0" class="text-sm text-muted">
        Nicio familie restantă nu se potrivește cu „{{ query }}".
      </p>

      <div class="space-y-2">
        <div
          v-for="row in visible"
          :key="row.invoiceId"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-muted rounded-lg p-4"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium">{{ row.parentName }}</span>
              <UBadge :color="ARREARS_BUCKET_COLORS[row.bucket]" variant="subtle" size="sm">
                {{ ARREARS_BUCKET_LABELS[row.bucket] }}
              </UBadge>
              <!-- Money on its way (E16/S6): still owed, but not somebody to chase. -->
              <UBadge v-if="row.announced > 0" color="info" variant="subtle" size="sm">
                Transfer anunțat {{ formatLei(row.announced) }}
              </UBadge>
            </div>
            <p class="text-muted text-sm mt-0.5 tabular-nums">
              {{ formatMonth(row.monthIssued) }} · termen {{ formatDateKey(row.dueOn) }}
              <template v-if="row.daysOverdue > 0">
                · {{ countOf(row.daysOverdue, "zi", "zile") }} întârziere
              </template>
            </p>
            <p v-if="row.paid > 0" class="text-muted text-sm">
              A plătit {{ formatLei(row.paid) }} din {{ formatLei(row.amount) }}
            </p>
          </div>

          <div class="flex items-center gap-3 shrink-0">
            <p class="font-bold text-lg tabular-nums">{{ formatLei(row.outstanding) }}</p>
            <!-- Chasing a payment is a phone call. The number is here so it is not a screen away. -->
            <UButton
              v-if="row.phone"
              :to="`tel:${row.phone}`"
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-phone"
            >
              Sună
            </UButton>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-wallet"
              @click="startRecording(row)"
            >
              Încasează
            </UButton>
          </div>
        </div>
      </div>
      <div v-if="hidden > 0" class="flex flex-wrap items-center gap-3">
        <p class="text-sm text-muted">
          Încă {{ countOf(hidden, "factură", "facturi") }} mai jos, mai noi decât cele de deasupra.
        </p>
        <UButton color="neutral" variant="outline" size="sm" @click="more">
          Arată încă {{ Math.min(hidden, step) }}
        </UButton>
      </div>
    </template>

    <AdminPaymentModal v-model:open="recording" :row="recordingRow" @recorded="refresh" />
  </AdminPage>
</template>

<script setup lang="ts">
import { countOf } from "~/composables/useRomanianCount";
import { nameMatches, useListWindow } from "~/composables/useListWindow";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { formatDateKey, formatLei, formatMonth } from "~/composables/useAdminFormat";
import type { ArrearsBucket, ArrearsRow } from "~/types/arrears.types";
import { ARREARS_BUCKET_COLORS, ARREARS_BUCKET_LABELS } from "~/types/arrears.types";

/**
 * Who has not paid — E16/S7.
 *
 * Ageing is the only axis. The story asks for grouping by location too, but an invoice belongs to a
 * family and a family may have children at both addresses — the codebase already decided invoices
 * ignore the location selector for that reason, and grouping arrears by location would have to pick
 * one of a family's two arbitrarily.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Restanțe",
});

const invoiceApi = useInvoiceApi();

const loading = ref(true);
const loadError = ref("");
const rows = ref<ArrearsRow[]>([]);

const buckets: ArrearsBucket[] = ["due_soon", "overdue", "over_30", "over_60"];
const bandCount = (band: ArrearsBucket) => rows.value.filter((row) => row.bucket === band).length;

const totalOutstanding = computed(
  () => Math.round(rows.value.reduce((sum, row) => sum + row.outstanding, 0) * 100) / 100
);

const recording = ref(false);
const recordingRow = ref<ArrearsRow | null>(null);

const startRecording = (row: ArrearsRow) => {
  recordingRow.value = row;
  recording.value = true;
};

/** The rows a typed name keeps; the tiles and the total above stay the whole list's. */
const query = ref("");
const matching = computed(() =>
  rows.value.filter((row) => nameMatches(row.parentName, query.value))
);
const { visible, hidden, more, step } = useListWindow(matching);

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    rows.value = await invoiceApi.fetchArrears();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea restanțelor");
  } finally {
    loading.value = false;
  }
};

/**
 * After a payment, read again — the invoice may now be covered, and then the right thing to show
 * is its absence, which is the list's own answer to give — but **without** the loading state. It
 * swapped the list for a spinner and drew it again from the top: the office, ten cards down the
 * page, found itself back at October 2023 after every payment (QA of 27 September 2026).
 */
const { error: notifyError } = useNotifications();
const refresh = async () => {
  try {
    rows.value = await invoiceApi.fetchArrears();
  } catch (err: unknown) {
    notifyError(apiErrorMessage(err, "Plata e înregistrată, dar n-am putut reîncărca lista."));
  }
};

onMounted(load);
</script>
