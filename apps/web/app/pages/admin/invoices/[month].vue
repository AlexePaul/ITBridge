<template>
  <AdminPage
    :title="`Facturi — ${month}`"
    :subtitle="`Toate facturile emise în luna ${formatMonth(month)}`"
    back-to="/admin/invoices"
    width="xl"
  >
    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <AdminEmpty
      v-else-if="filteredInvoices.length === 0"
      title="Nu sunt facturi pentru această lună."
      description="Se emit din „Emitere facturi”, pe luna aleasă acolo."
      icon="i-lucide-file-text"
    />

    <div v-else>
      <!--
        E16/S3's progress, with the mode in words beside it: "în coadă" means one thing when the
        platform is sending and another when SMARTBILL_MODE is off, and only the second is news.
      -->
      <div v-if="fiscalQueue" class="mb-4 text-sm text-muted" role="status">
        <p>
          <strong>SmartBill:</strong> {{ SMARTBILL_MODE_LABELS[fiscalQueue.mode] }}.
          <template v-if="fiscalSummary"> Luna asta: {{ fiscalSummary }}.</template>
        </p>
        <p v-if="fiscalQueue.missing.length" class="text-error">
          Lipsesc setările {{ fiscalQueue.missing.join(", ") }} — facturile așteaptă în coadă.
        </p>
        <p v-if="fiscalQueue.lockedUntil" class="text-warning">
          SmartBill a blocat temporar accesul pentru prea multe cereri; coada reia singură după
          {{ formatTime(fiscalQueue.lockedUntil) }}.
        </p>
      </div>

      <p v-if="actionError" class="mb-4 text-sm text-error" role="alert">{{ actionError }}</p>

      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-primary">
              <th class="text-left py-3 px-4 font-semibold">ID</th>
              <th class="text-left py-3 px-4 font-semibold">Nume</th>
              <th class="text-left py-3 px-4 font-semibold">Suma (RON)</th>
              <th class="text-left py-3 px-4 font-semibold">Data Emiterii</th>
              <th class="text-left py-3 px-4 font-semibold">Stare</th>
              <th class="text-left py-3 px-4 font-semibold">SmartBill</th>
              <th class="text-center py-3 px-4 font-semibold">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invoice in filteredInvoices"
              :key="invoice.id"
              class="border-b border-muted hover:border-primary"
            >
              <td class="py-3 px-4">{{ invoice.id }}</td>
              <td class="py-3 px-4">
                {{ invoice.parent?.firstName }} {{ invoice.parent?.lastName }}
              </td>
              <td class="py-3 px-4">{{ formatCurrency(invoice.amount) }}</td>
              <td class="py-3 px-4">{{ formatDate(invoice.dateIssued) }}</td>
              <td class="py-3 px-4">
                <UBadge :color="getStatusColor(invoice.status)" variant="outline">
                  {{ formatStatus(invoice.status) }}
                </UBadge>
              </td>
              <td class="py-3 px-4 align-top">
                <span v-if="!invoice.fiscalStatus" class="text-muted">—</span>
                <div v-else class="flex flex-col gap-1">
                  <UBadge
                    :color="FISCAL_STATUS_COLORS[invoice.fiscalStatus]"
                    variant="subtle"
                    class="self-start"
                  >
                    {{ FISCAL_STATUS_LABELS[invoice.fiscalStatus] }}
                    <template v-if="invoice.fiscalNumber">
                      &nbsp;{{ invoice.fiscalSeries }} {{ invoice.fiscalNumber }}
                    </template>
                  </UBadge>
                  <a
                    v-if="invoice.fiscalDocumentUrl"
                    :href="invoice.fiscalDocumentUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs underline"
                    :aria-label="`Deschide în SmartBill documentul familiei ${familyName(invoice)}`"
                  >
                    Deschide în SmartBill
                  </a>
                  <p v-if="invoice.fiscalLastError" class="text-xs text-muted max-w-xs">
                    {{ invoice.fiscalLastError }}
                  </p>

                  <!-- Refused: fixed somewhere else, then sent again from here. -->
                  <UButton
                    v-if="invoice.fiscalStatus === 'failed'"
                    size="sm"
                    variant="outline"
                    class="self-start min-h-11"
                    :loading="busy === invoice.id"
                    :aria-label="`Retrimite în SmartBill factura familiei ${familyName(invoice)}`"
                    @click="retry(invoice)"
                  >
                    Retrimite
                  </UButton>

                  <!--
                    Under review: the answer was lost and the series moved. The platform does not
                    adopt a fiscal number it never saw come back — somebody reads it in SmartBill.
                  -->
                  <div v-if="invoice.fiscalStatus === 'review'" class="flex flex-col gap-1">
                    <UInput
                      v-model="confirmNumbers[invoice.id]"
                      size="sm"
                      inputmode="numeric"
                      :placeholder="suggestedNumber(invoice)"
                      :aria-label="`Numărul fiscal din SmartBill pentru factura familiei ${familyName(invoice)}`"
                    />
                    <div class="flex gap-2 flex-wrap">
                      <UButton
                        size="sm"
                        class="min-h-11"
                        :loading="busy === invoice.id"
                        :disabled="!confirmNumberFor(invoice)"
                        :aria-label="`Confirmă numărul fiscal al facturii familiei ${familyName(invoice)}`"
                        @click="confirm(invoice)"
                      >
                        E emisă cu numărul ăsta
                      </UButton>
                      <UButton
                        size="sm"
                        variant="outline"
                        class="min-h-11"
                        :loading="busy === invoice.id"
                        :aria-label="`Nu există în SmartBill, retrimite factura familiei ${familyName(invoice)}`"
                        @click="retry(invoice)"
                      >
                        Nu există, retrimite
                      </UButton>
                    </div>
                  </div>
                </div>
              </td>
              <td class="py-3 px-4 text-center">
                <!-- A free month is a 0-lei row with nothing to print (E15/S6): no button that
                     can only lead to "there is no invoice". -->
                <UButton
                  v-if="invoice.status !== 'waived'"
                  size="sm"
                  variant="outline"
                  @click="() => visualisePDF(invoice.id)"
                >
                  Vizualizează PDF
                </UButton>
                <span v-else class="text-sm text-muted">Fără factură</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import { formatMonth } from "~/composables/useAdminFormat";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { apiErrorMessage } from "~/composables/useApiError";
import type { FiscalQueueStatus, Invoice } from "~/types/invoice.types";
import {
  FISCAL_STATUS_COLORS,
  FISCAL_STATUS_LABELS,
  SMARTBILL_MODE_LABELS,
} from "~/types/invoice.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Facturi pe Lună",
});

const route = useRoute();
const invoiceApi = useInvoiceApi();
const invoices: Ref<Invoice[]> = ref([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const month = computed(() => route.params.month as string);

const filteredInvoices = computed(() =>
  invoices.value.filter((inv) => inv.monthIssued === month.value)
);

const totalAmount = computed(() =>
  filteredInvoices.value.reduce((sum, inv) => sum + inv.amount, 0)
);

const paidCount = computed(
  () => filteredInvoices.value.filter((inv) => inv.status === "paid").length
);

const formatDate = (date: string) => {
  const d = new Date(date);
  return d.toLocaleDateString("ro-RO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const formatCurrency = (amount: number) => {
  return amount.toLocaleString("ro-RO", { style: "currency", currency: "RON" });
};

const formatStatus = (status: string) => {
  const statusMap: Record<string, string> = {
    paid: "Plătit",
    pending: "În așteptare",
    overdue: "Depășit",
    waived: "Fără plată",
  };
  return statusMap[status] || status;
};

const getStatusColor = (
  status: string
): "success" | "warning" | "error" | "primary" | "secondary" | "neutral" | "info" | undefined => {
  const colorMap: Record<string, "success" | "warning" | "error"> = {
    paid: "success",
    pending: "warning",
    overdue: "error",
  };
  return colorMap[status];
};

const fiscalQueue = ref<FiscalQueueStatus | null>(null);
const actionError = ref<string | null>(null);
const busy = ref<number | null>(null);
const confirmNumbers = ref<Record<number, string>>({});

/** "12 emise, 3 în coadă, 1 refuzată" — only the states that have something in them. */
const fiscalSummary = computed(() => {
  if (!fiscalQueue.value) return "";
  return (Object.entries(fiscalQueue.value.counts) as [keyof typeof FISCAL_STATUS_LABELS, number][])
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${count} ${FISCAL_STATUS_LABELS[state].toLowerCase()}`)
    .join(", ");
});

const familyName = (invoice: Invoice) =>
  `${invoice.parent?.firstName ?? ""} ${invoice.parent?.lastName ?? ""}`.trim() || `#${invoice.id}`;

/**
 * The number the series was at when the answer went missing, zero-padded like the numbers
 * SmartBill already gave this month — a suggestion to compare against SmartBill, not an answer.
 */
const suggestedNumber = (invoice: Invoice) => {
  if (invoice.fiscalExpectedNumber === null) return "Numărul din SmartBill";
  const width = filteredInvoices.value.find((row) => row.fiscalNumber)?.fiscalNumber?.length ?? 0;
  return String(invoice.fiscalExpectedNumber).padStart(width, "0");
};

const confirmNumberFor = (invoice: Invoice) => (confirmNumbers.value[invoice.id] ?? "").trim();

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });

const act = async (invoice: Invoice, request: () => Promise<Invoice>, fallback: string) => {
  busy.value = invoice.id;
  actionError.value = null;
  try {
    await request();
    await load();
  } catch (err: unknown) {
    actionError.value = apiErrorMessage(err, fallback);
  } finally {
    busy.value = null;
  }
};

const retry = (invoice: Invoice) =>
  act(invoice, () => invoiceApi.retryFiscal(invoice.id), "Nu am putut retrimite factura.");

const confirm = (invoice: Invoice) =>
  act(
    invoice,
    () => invoiceApi.confirmFiscal(invoice.id, confirmNumberFor(invoice)),
    "Nu am putut confirma numărul facturii."
  );

const visualisePDF = (invoiceId: number) => {
  // Navigate to PDF download or trigger download
  navigateTo(`/admin/invoices/${invoiceId}/pdf`);
};

/**
 * The month's invoices, with the two states the screen used to skip.
 *
 * There was no `catch` and no loading state, so a failed fetch left an empty list behind the
 * screen's own "no invoices for this month" — a sentence about billing that was not true, on a
 * page somebody opens to check whether a family was charged.
 */
const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    await invoiceApi.fetchInvoices();
    invoices.value = (await invoiceApi.getInvoices()) || [];
    // Beside the list, never instead of it: a queue status that could not be read leaves the
    // invoices on screen, each with its own state.
    fiscalQueue.value = await invoiceApi.fetchFiscalQueue(month.value).catch(() => null);
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca facturile lunii.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>
