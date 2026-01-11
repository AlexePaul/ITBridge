<template>
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold">Facturi</h1>
      <p class="text-muted mt-1">Gestionează toate facturile școlii după luna si anul emiterii</p>
    </div>
    <UButton
      color="secondary"
      variant="subtle"
      class="mr-3 ml-auto flex items-center h-11"
      size="lg"
      @click="navigateTo('/admin/invoices/new')"
    >
      <UIcon name="i-lucide-file-plus" class="mr-2" />
      Genereaza Facturi Noi
    </UButton>
  </div>

  <div class="w-9/12 mx-auto px-4 sm:px-6 lg:px-8 pb-16">
    <template v-for="year in Object.keys(months).sort((a, b) => Number(b) - Number(a))" :key="year">
      <div class="border-t border-primary pb-5 mb-5">
        <h2 class="text-2xl font-semibold my-4">{{ year }}</h2>
        <div class="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <template v-for="month in months[year]" :key="month.month">
            <UCard
              class="h-min border border-transparent hover:border-primary cursor-pointer"
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
</template>
<script setup lang="ts">
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

const formatMonthName = (monthStr: string): string => {
  const monthNames: Record<number, string> = {
    1: "Ianuarie",
    2: "Februarie",
    3: "Martie",
    4: "Aprilie",
    5: "Mai",
    6: "Iunie",
    7: "Iulie",
    8: "August",
    9: "Septembrie",
    10: "Octombrie",
    11: "Noiembrie",
    12: "Decembrie",
  };
  const [, month] = monthStr.split("-");
  return monthNames[Number(month)] || monthStr;
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
  console.log("Invoices grouped by month:", months.value);
});
</script>
