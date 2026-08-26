<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Genereaza Facturi</h1>
        <p class="text-muted mt-1">
          Selecteaza luna si anul pentru care doresti sa generezi facturi
        </p>
      </div>
      <UButton @click="navigateTo('/admin/invoices')" variant="outline"> Înapoi </UButton>
    </div>

    <div class="max-w-md mx-auto">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Genereaza Facturi Noi</h2>
        </template>

        <UForm :state="formState" @submit="generateInvoices" class="flex flex-col gap-4">
          <UFormGroup label="An" name="year" class="w-full">
            <USelect
              v-model="formState.year"
              :items="yearitems"
              placeholder="Selecteaza anul"
              value-attribute="value"
              option-attribute="label"
              class="w-full"
            />
          </UFormGroup>

          <UFormGroup label="Luna" name="month" class="w-full">
            <USelect
              v-model="formState.month"
              :items="monthitems"
              :disabled="!formState.year"
              placeholder="Selecteaza luna"
              value-attribute="value"
              option-attribute="label"
              class="w-full"
            />
          </UFormGroup>

          <UButton
            type="submit"
            :loading="isLoading"
            :disabled="!formState.year || !formState.month || isLoading"
            color="primary"
            variant="subtle"
            class="w-full"
          >
            Genereaza Facturi
          </UButton>
        </UForm>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import type { Invoice } from "~/types/invoice.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Genereaza Facturi",
});

const invoiceApi = useInvoiceApi();
const invoices: Ref<Invoice[]> = ref([]);
const isLoading = ref(false);

const formState = reactive({
  year: "",
  month: "",
});

const monthNames = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];

const currentYear = new Date().getFullYear();

const yearitems = computed(() => {
  const years = [];
  for (let i = currentYear - 2; i <= currentYear + 1; i++) {
    years.push({ value: String(i), label: String(i) });
  }
  return years;
});

console.log(yearitems.value);

const existingMonths = computed(() => {
  const months = new Set<string>();
  invoices.value.forEach((inv) => {
    months.add(inv.monthIssued);
  });
  return months;
});

const monthitems = computed(() => {
  return monthNames.map((name, index) => {
    const month = String(index + 1).padStart(2, "0");
    const fullMonth = `${formState.year}-${month}`;
    const isDisabled = existingMonths.value.has(fullMonth);
    return {
      value: month,
      label: isDisabled ? `${name} (exista deja)` : name,
      disabled: isDisabled,
    };
  });
});

const generateInvoices = async () => {
  if (!formState.year || !formState.month) return;
  navigateTo(`/admin/invoices/preview/${formState.year}-${formState.month}`);
};

onMounted(async () => {
  await invoiceApi.fetchInvoices();
  invoices.value = (await invoiceApi.getInvoices()) || [];
});
</script>
