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
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-primary">
              <th class="text-left py-3 px-4 font-semibold">ID</th>
              <th class="text-left py-3 px-4 font-semibold">Nume</th>
              <th class="text-left py-3 px-4 font-semibold">Suma (RON)</th>
              <th class="text-left py-3 px-4 font-semibold">Data Emiterii</th>
              <th class="text-left py-3 px-4 font-semibold">Stare</th>
              <th class="text-center py-3 px-4 font-semibold">Acțiuni</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invoice in filteredInvoices"
              :key="invoice.id"
              class="border-b border-gray-200 hover:border-primary"
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
              <td class="py-3 px-4 text-center">
                <UButton size="sm" variant="outline" @click="() => visualisePDF(invoice.id)">
                  Vizualizează PDF
                </UButton>
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
import type { Invoice } from "~/types/invoice.types";

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
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca facturile lunii.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>
