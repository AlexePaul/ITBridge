<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Facturi - {{ month }}</h1>
        <p class="text-muted mt-1">Toate facturile emise în luna {{ formatMonth(month) }}</p>
      </div>
      <UButton @click="navigateTo('/admin/invoices')" variant="outline"> Înapoi </UButton>
    </div>

    <div v-if="filteredInvoices.length === 0" class="text-center py-12">
      <p class="text-muted text-lg">Nu sunt facturi pentru această lună.</p>
    </div>

    <div v-else class="w-full mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div class="overflow-x-auto">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-b border-primary">
              <th class="text-left py-3 px-4 font-semibold">ID</th>
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
  </div>
</template>

<script setup lang="ts">
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import type { Invoice } from "~/types/invoice.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Facturi pe Lună",
});

const route = useRoute();
const invoiceApi = useInvoiceApi();
const invoices: Ref<Invoice[]> = ref([]);
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

const formatMonth = (monthStr: string) => {
  const [year, month] = monthStr.split("-") as [string, string];
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("ro-RO", { year: "numeric", month: "long" });
};

const visualisePDF = (invoiceId: number) => {
  // Navigate to PDF download or trigger download
  navigateTo(`/admin/invoices/${invoiceId}/pdf`);
};

onMounted(async () => {
  await invoiceApi.fetchInvoices();
  invoices.value = (await invoiceApi.getInvoices()) || [];
});
</script>
