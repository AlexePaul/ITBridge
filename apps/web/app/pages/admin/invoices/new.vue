<template>
  <AdminPage
    title="Generează facturi"
    subtitle="Alege luna pentru care vrei să vezi facturile propuse"
    width="md"
    back-to="/admin/invoices"
  >
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">Luna de facturat</h2>
      </template>

      <UForm :state="formState" class="flex flex-col gap-4" @submit="openPreview">
        <UFormField label="An" name="year" required>
          <USelect
            v-model="formState.year"
            :items="yearItems"
            placeholder="Selectează anul"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Lună" name="month" required>
          <USelect
            v-model="formState.month"
            :items="monthItems"
            :disabled="!formState.year"
            placeholder="Selectează luna"
            class="w-full"
          />
        </UFormField>

        <AdminFormActions submit-label="Vezi propunerea" :disabled="!monthChosen" />
      </UForm>
    </UCard>
  </AdminPage>
</template>

<script setup lang="ts">
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import type { Invoice } from "~/types/invoice.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Generează facturi",
});

/**
 * Pick a month, then look at what would be issued — E18/S5b.
 *
 * The screen was written against @nuxt/ui v2 and never moved: `UFormGroup` does not exist in v4,
 * so both labels rendered as an unknown element and the two selects sat on the page unnamed. The
 * v2 `value-attribute` / `option-attribute` pair went with it; v4 reads `{ label, value }` items
 * on its own.
 */
const invoiceApi = useInvoiceApi();
const invoices: Ref<Invoice[]> = ref([]);

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

const yearItems = computed(() => {
  const years = [];
  for (let i = currentYear - 2; i <= currentYear + 1; i++) {
    years.push({ value: String(i), label: String(i) });
  }
  return years;
});

/** Months that already have invoices, so the list can say so instead of letting them be picked. */
const existingMonths = computed(() => new Set(invoices.value.map((inv) => inv.monthIssued)));

const monthItems = computed(() =>
  monthNames.map((name, index) => {
    const month = String(index + 1).padStart(2, "0");
    const alreadyIssued = existingMonths.value.has(`${formState.year}-${month}`);
    return {
      value: month,
      label: alreadyIssued ? `${name} (există deja)` : name,
      disabled: alreadyIssued,
    };
  })
);

const monthChosen = computed(() => Boolean(formState.year && formState.month));

const openPreview = async () => {
  if (!monthChosen.value) return;
  await navigateTo(`/admin/invoices/preview/${formState.year}-${formState.month}`);
};

onMounted(async () => {
  await invoiceApi.fetchInvoices();
  invoices.value = (await invoiceApi.getInvoices()) || [];
});
</script>
