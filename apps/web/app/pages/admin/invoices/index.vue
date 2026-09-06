<template>
  <AdminPage
    title="Facturi"
    subtitle="Fiecare lună de facturare, cu ce s-a emis și ce a intrat."
    width="xl"
  >
    <template #actions>
      <UButton to="/admin/invoices/emitere" icon="i-lucide-file-plus" class="min-h-11">
        Emite facturi
      </UButton>
    </template>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />

    <template v-else-if="report">
      <!-- The three numbers somebody opens this screen to read, before any month in particular. -->
      <div class="grid gap-3 sm:grid-cols-3">
        <div v-for="total in totals" :key="total.label" class="border-muted rounded-lg border p-4">
          <p class="text-2xl font-semibold tabular-nums">{{ total.value }}</p>
          <p class="text-muted mt-0.5 text-sm">{{ total.label }}</p>
          <p class="text-muted mt-1 text-xs">{{ total.note }}</p>
        </div>
      </div>

      <AdminTable
        :rows="months"
        :columns="columns"
        empty-icon="i-lucide-receipt"
        empty-text="Nicio factură încă."
        empty-description="Prima lună apare aici după prima emitere."
        @row-click="(month) => navigateTo(`/admin/invoices/${month.month}`)"
      />

      <p class="text-muted text-xs">
        „Încasat" numără plățile reușite pe facturile lunii, oricând au venit — nu plățile datate în
        lună. Cele două diferă exact când o familie plătește târziu, iar
        <NuxtLink to="/admin/rapoarte" class="underline">raportul financiar</NuxtLink> le ține pe
        amândouă.
      </p>
    </template>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useReportsApi } from "~/composables/api/useReportsApi";
import { formatLei, formatMonth } from "~/composables/useAdminFormat";
import type { AdminTableColumn } from "~/types/admin-ui.types";
import type { FinanceMonth, FinanceReport } from "~/types/reports.types";

/**
 * The months of billing — E18/S5.
 *
 * This screen used to spend a full desktop window on three cards reading "Facturi: 10". The count
 * is the one thing about a billing month that cannot be acted on: what somebody opening it wants
 * to know is how much went out, how much came back, and which month is still owed.
 *
 * **The numbers are asked of the finance report, not recomputed here** — E21's rule, and the reason
 * it exists: a second `amount − payments` in a Vue file is a second definition of "outstanding",
 * and the two would drift the first time one of them learned about `waived` rows. The month list
 * still comes from `/invoices`, because that answers a different question — which months exist —
 * and the report answers for a range it is given.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Facturi",
});

const invoiceApi = useInvoiceApi();
const reportsApi = useReportsApi();

const loading = ref(true);
const loadError = ref("");
const report = ref<FinanceReport | null>(null);

/** Newest first: the month somebody is chasing is nearly always the last one. */
const months = computed(() =>
  [...(report.value?.months ?? [])].sort((a, b) => b.month.localeCompare(a.month))
);

const totals = computed(() => {
  const t = report.value?.totals;
  if (!t) return [];
  return [
    {
      label: "Emis",
      value: formatLei(t.invoiced),
      note: `${t.invoices} facturi · ${t.families} familii`,
    },
    {
      label: "Încasat",
      value: formatLei(t.collectedForMonth),
      note: "pe facturile lunilor de mai jos",
    },
    {
      label: "Rest de încasat",
      value: formatLei(t.outstanding),
      note: t.outstanding > 0 ? "vezi Restanțe pentru vechime" : "nimic neîncasat",
    },
  ];
});

const columns: AdminTableColumn<FinanceMonth>[] = [
  { key: "month", label: "Luna", icon: "i-lucide-calendar", accessor: (m) => formatMonth(m.month) },
  { key: "families", label: "Familii", icon: "i-lucide-users" },
  {
    key: "invoices",
    label: "Facturi",
    icon: "i-lucide-receipt",
    // `waived` rows are months settled at zero. They are real answers — a family with no invoice
    // for October looks like a month somebody forgot — so they are shown, and shown apart, because
    // adding them to a count of invoices with money in them would overstate the billing.
    accessor: (m) => (m.waived > 0 ? `${m.invoices} + ${m.waived} la zero` : m.invoices),
  },
  { key: "invoiced", label: "Emis", type: "money" },
  { key: "collectedForMonth", label: "Încasat", type: "money" },
  { key: "outstanding", label: "Rest", type: "money" },
];

onMounted(async () => {
  try {
    // `fetchInvoices` fills the composable's own ref and returns nothing; `getInvoices` reads it.
    await invoiceApi.fetchInvoices();
    const issued = invoiceApi
      .getInvoices()
      .map((invoice) => invoice.monthIssued)
      .filter(Boolean)
      .sort();
    if (issued.length === 0) {
      report.value = null;
      loading.value = false;
      return;
    }
    // The range is exactly the months that exist. The report fills the gaps with zero rows, which
    // is right: a month between two billed ones and with nothing in it is a fact, not an absence.
    report.value = await reportsApi.fetchFinanceReport(issued[0]!, issued[issued.length - 1]!);
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca facturile");
  } finally {
    loading.value = false;
  }
});
</script>
