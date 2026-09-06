<template>
  <AdminPage
    title="Facturi"
    subtitle="Toate facturile școlii, după luna și anul emiterii"
    width="xl"
  >
    <template #actions>
      <UButton
        color="secondary"
        variant="subtle"
        size="lg"
        class="min-h-11 flex items-center"
        icon="i-lucide-file-plus"
        to="/admin/invoices/emitere"
      >
        Emite facturi
      </UButton>
    </template>

    <div class="pb-16">
      <template
        v-for="year in Object.keys(months).sort((a, b) => Number(b) - Number(a))"
        :key="year"
      >
        <div class="border-t border-primary pb-5 mb-5">
          <h2 class="text-2xl font-semibold my-4">{{ year }}</h2>
          <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <template v-for="month in months[year]" :key="month.month">
              <UCard
                :class="['h-min cursor-pointer', getMonthBorderClass(month.month)]"
                @click="() => navigateTo(`/admin/invoices/${month.month}`)"
              >
                <template #header
                  ><div class="text-secondary text-sm">
                    <p class="font-bold">{{ formatMonthName(month.month) }}</p>
                    <p class="text-xs text-muted">{{ month.month }}</p>
                  </div></template
                >
                <template #default
                  ><p class="text-sm">Facturi: {{ month.count }}</p></template
                ></UCard
              >
            </template>
          </div>
        </div>
      </template>
    </div>
  </AdminPage>
</template>
<script setup lang="ts">
import { formatMonthName } from "~/composables/useAdminFormat";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import type { Invoice } from "~/types/invoice.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Facturilor",
});

const invoiceApi = useInvoiceApi();
const invoices: Ref<Invoice[]> = ref([]);
const months: Ref<Record<string, { month: string; count: number }[]>> = ref({});

const getMonthBorderClass = (month: string): string => {
  const monthInvoices = invoices.value.filter((inv) => inv.monthIssued === month);
  const hasOverdue = monthInvoices.some((inv) => inv.status === "overdue");
  const hasPending = monthInvoices.some((inv) => inv.status === "pending");

  if (hasOverdue) {
    return "border border-error";
  } else if (hasPending) {
    return "border border-warning";
  } else {
    return "border border-transparent hover:border-primary";
  }
};

onMounted(async () => {
  await invoiceApi.fetchInvoices();
  invoices.value = (await invoiceApi.getInvoices()) || [];
  // Build a map: year -> [{ month, count }]
  const yearMap: Record<string, { month: string; count: number }[]> = {};
  const monthMap: Record<string, number> = {};

  invoices.value.forEach((inv) => {
    monthMap[inv.monthIssued] = (monthMap[inv.monthIssued] || 0) + 1;
  });

  Object.entries(monthMap).forEach(([month, count]) => {
    const year = month.split("-")[0] as string;
    if (!yearMap[year]) yearMap[year] = [];
    yearMap[year].push({ month, count });
  });

  // Sort months within each year from oldest to newest
  Object.values(yearMap).forEach((arr) =>
    arr.sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())
  );

  months.value = yearMap;
});
</script>
