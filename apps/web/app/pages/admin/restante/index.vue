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
    <AdminError v-else-if="loadError" :message="loadError" />

    <AdminEmpty
      v-else-if="rows.length === 0"
      icon="i-lucide-check-check"
      title="Nicio restanță"
      description="Toate facturile emise sunt achitate sau încă în termen."
    />

    <template v-else>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div v-for="band in buckets" :key="band" class="border border-muted rounded-lg p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ countOf(band) }}</p>
          <p class="text-sm text-muted">{{ ARREARS_BUCKET_LABELS[band] }}</p>
        </div>
      </div>

      <div class="space-y-2">
        <div
          v-for="row in rows"
          :key="row.invoiceId"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-muted rounded-lg p-4"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-medium">{{ row.parentName }}</span>
              <UBadge :color="ARREARS_BUCKET_COLORS[row.bucket]" variant="subtle" size="sm">
                {{ ARREARS_BUCKET_LABELS[row.bucket] }}
              </UBadge>
            </div>
            <p class="text-muted text-sm mt-0.5 tabular-nums">
              {{ formatMonth(row.monthIssued) }} · termen {{ formatDateKey(row.dueOn) }}
              <template v-if="row.daysOverdue > 0">
                · {{ row.daysOverdue }} {{ row.daysOverdue === 1 ? "zi" : "zile" }} întârziere
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
    </template>

    <AdminPaymentModal v-model:open="recording" :row="recordingRow" @recorded="load" />
  </AdminPage>
</template>

<script setup lang="ts">
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
const countOf = (band: ArrearsBucket) => rows.value.filter((row) => row.bucket === band).length;

const totalOutstanding = computed(
  () => Math.round(rows.value.reduce((sum, row) => sum + row.outstanding, 0) * 100) / 100
);

const recording = ref(false);
const recordingRow = ref<ArrearsRow | null>(null);

const startRecording = (row: ArrearsRow) => {
  recordingRow.value = row;
  recording.value = true;
};

const load = async () => {
  try {
    rows.value = await invoiceApi.fetchArrears();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea restanțelor");
  } finally {
    loading.value = false;
  }
};

// Reloaded rather than patched in place: the invoice may now be covered, in which case the right
// thing to show is its absence, and that is the list's own answer to give.
onMounted(load);
</script>
