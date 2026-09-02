<template>
  <AdminPage
    title="Încasează"
    subtitle="Facturile care mai au ceva de plată. Alege familia din listă — suma vine precompletată cu restul."
    width="lg"
  >
    <template #actions>
      <UButton color="neutral" variant="ghost" to="/admin/payments" icon="i-lucide-list">
        Registrul plăților
      </UButton>
    </template>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />

    <AdminEmpty
      v-else-if="rows.length === 0"
      icon="i-lucide-check-check"
      title="Nimic de încasat"
      description="Toate facturile emise sunt achitate."
    />

    <template v-else>
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Caută după nume sau număr de factură"
        class="w-full"
      />

      <AdminEmpty
        v-if="visible.length === 0"
        icon="i-lucide-search-x"
        title="Nicio factură"
        description="Niciun rezultat pentru ce ai căutat."
      />

      <div v-else class="space-y-2">
        <div
          v-for="row in visible"
          :key="row.invoiceId"
          class="flex items-center justify-between gap-3 border border-muted rounded-lg p-4"
        >
          <div class="min-w-0">
            <p class="font-medium">{{ row.parentName }}</p>
            <p class="text-sm text-muted tabular-nums">
              Factura #{{ row.invoiceId }} · {{ formatMonth(row.monthIssued) }}
              <template v-if="row.paid > 0">
                · a plătit {{ formatLei(row.paid) }} din {{ formatLei(row.amount) }}
              </template>
            </p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <p class="font-bold tabular-nums">{{ formatLei(row.outstanding) }}</p>
            <UButton color="primary" variant="soft" size="sm" @click="startRecording(row)">
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
import { formatLei, formatMonth } from "~/composables/useAdminFormat";
import type { ArrearsRow } from "~/types/arrears.types";

/**
 * Where an admin starts a receipt — E16/S5.
 *
 * **The list is the arrears list**, not every invoice ever issued. The two sets are the same one:
 * an invoice that still takes money is exactly an invoice that is `pending` or `overdue` with
 * something left on it, which is what `GET /invoices/arrears` already answers. Asking it means the
 * outstanding sum arrives computed, so this screen never subtracts payments from a total itself —
 * the arithmetic has one home, and the prefilled amount cannot disagree with the arrears screen.
 *
 * What it replaces was a blank form with a combo box over all invoices, prefilling the invoice
 * *total*: a family paying the second half of a month had the whole month typed for them.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Încasează",
});

const invoiceApi = useInvoiceApi();

const loading = ref(true);
const loadError = ref("");
const rows = ref<ArrearsRow[]>([]);
const search = ref("");

const recording = ref(false);
const recordingRow = ref<ArrearsRow | null>(null);

const startRecording = (row: ArrearsRow) => {
  recordingRow.value = row;
  recording.value = true;
};

const visible = computed(() => {
  const needle = search.value.trim().toLowerCase();
  if (!needle) return rows.value;
  return rows.value.filter(
    (row) => row.parentName.toLowerCase().includes(needle) || String(row.invoiceId).includes(needle)
  );
});

const load = async () => {
  try {
    rows.value = await invoiceApi.fetchArrears();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea facturilor");
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>
