<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Adaugă Plată Nouă</h1>
        <p class="text-muted mt-1">Creează o plată nouă pentru o factură existentă</p>
      </div>
      <UButton @click="navigateTo('/admin/payments')" variant="outline"> Înapoi </UButton>
    </div>

    <div class="max-w-md mx-auto">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Detalii Plată</h2>
        </template>

        <UForm :state="formState" @submit="createPayment" class="flex flex-col gap-4">
          <UFormGroup label="Factură" name="invoiceId" class="w-full" required>
            <UInputMenu
              v-model="formState.invoiceId"
              :items="invoiceItems"
              :loading="isLoadingInvoices"
              placeholder="Caută după nume sau factură..."
              searchable
              value-attribute="value"
              option-attribute="label"
              class="w-full"
            />
          </UFormGroup>

          <UFormGroup label="Metodă de plată" name="method" class="w-full">
            <USelect
              v-model="formState.method"
              :items="paymentMethods"
              placeholder="Selectează metoda de plată"
              value-attribute="value"
              option-attribute="label"
              class="w-full"
            />
          </UFormGroup>

          <UFormGroup label="Data plății" name="date" class="w-full" required>
            <UInput
              v-model="formState.date"
              type="date"
              placeholder="Selectează data"
              class="w-full"
            />
          </UFormGroup>

          <UButton
            type="submit"
            :loading="isLoading"
            :disabled="!formState.invoiceId || !formState.date || isLoading"
            color="primary"
            variant="subtle"
            class="w-full"
          >
            Creează Plata
          </UButton>
        </UForm>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePaymentsApi } from "~/composables/api/usePaymentsApi";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useNotifications } from "~/composables/useNotifications";
import type { Invoice } from "~/types/invoice.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Adaugă Plată Nouă",
});

const paymentsApi = usePaymentsApi();
const invoiceApi = useInvoiceApi();
const { error, success } = useNotifications();

const isLoading = ref(false);
const isLoadingInvoices = ref(false);
const invoices = ref<Invoice[]>([]);

const formState = reactive({
  invoiceId: undefined as { value: number; label: string } | undefined,
  method: "cash",
  date: new Date().toISOString().split("T")[0],
});

const paymentMethods = [
  { value: "cash", label: "Numerar" },
  { value: "card", label: "Card (transfer bancar)" },
  { value: "other", label: "Altele" },
];

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

const formatMonth = (monthIssued: string) => {
  const [year, month] = monthIssued.split("-");
  return `${monthNames[parseInt(month as string) - 1]} ${year}`;
};

const invoiceItems = computed(() => {
  return invoices.value
    .filter((invoice) => invoice.status === "pending")
    .map((invoice) => ({
      value: invoice.id,
      label: `Factură #${invoice.id} - ${invoice.parent?.firstName} ${invoice.parent?.lastName} - ${formatMonth(invoice.monthIssued)} - ${invoice.amount} RON`,
    }));
});

const loadInvoices = async () => {
  isLoadingInvoices.value = true;
  try {
    await invoiceApi.fetchInvoices();
    invoices.value = invoiceApi.getInvoices();
  } catch (err) {
    console.error("Error loading invoices:", err);
    error("Eroare", "Nu s-au putut încărca facturile");
  } finally {
    isLoadingInvoices.value = false;
  }
};

const createPayment = async () => {
  if (!formState.invoiceId || !formState.date) {
    error("Eroare", "Te rog completează toate câmpurile obligatorii");
    return;
  }

  isLoading.value = true;
  try {
    await paymentsApi.createPayment({
      invoiceId: formState.invoiceId.value,
      method: formState.method,
      date: formState.date,
    });

    success("Succes", "Plata a fost creată cu succes");

    navigateTo("/admin/payments");
  } catch (err) {
    console.error("Error creating payment:", err);
    error("Eroare", "Nu s-a putut crea plata");
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadInvoices();
});
</script>
