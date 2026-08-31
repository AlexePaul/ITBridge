<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Adaugă Plată Nouă</h1>
        <p class="text-muted mt-1">Înregistrează o sumă încasată pentru o factură existentă</p>
      </div>
      <UButton variant="outline" @click="navigateTo('/admin/payments')"> Înapoi </UButton>
    </div>

    <div class="max-w-md mx-auto">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Detalii Plată</h2>
        </template>

        <UForm :state="formState" class="flex flex-col gap-4" @submit="createPayment">
          <UFormField label="Factură" name="invoiceId" class="w-full" required>
            <UInputMenu
              v-model="formState.invoiceId"
              :items="invoiceItems"
              :loading="isLoadingInvoices"
              placeholder="Caută după nume sau factură..."
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Suma încasată (lei)"
            name="amount"
            class="w-full"
            required
            help="Se poate încasa și parțial — factura rămâne în așteptare până e acoperită."
          >
            <UInput
              v-model.number="formState.amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="350"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Metodă de plată" name="method" class="w-full">
            <USelect
              v-model="formState.method"
              :items="paymentMethods"
              placeholder="Selectează metoda de plată"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="formState.method === 'bank_transfer'"
            label="Referință (nr. OP)"
            name="externalReference"
            class="w-full"
            help="Numărul ordinului de plată — singurul lucru după care încasarea se regăsește în extras."
          >
            <UInput v-model="formState.externalReference" placeholder="OP 1234" class="w-full" />
          </UFormField>

          <UFormField label="Data plății" name="date" class="w-full" required>
            <UInput v-model="formState.date" type="date" class="w-full" />
          </UFormField>

          <UFormField label="Observații" name="notes" class="w-full">
            <UInput v-model="formState.notes" placeholder="Opțional" class="w-full" />
          </UFormField>

          <UButton
            type="submit"
            :loading="isLoading"
            :disabled="!canSubmit"
            color="primary"
            variant="subtle"
            class="w-full"
          >
            Înregistrează Plata
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
import { apiErrorMessage } from "~/composables/useApiError";
import type { Invoice } from "~/types/invoice.types";
import type { PaymentMethod } from "~/types/payment.types";
import { PAYMENT_METHOD_LABELS } from "~/types/payment.types";

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
  amount: undefined as number | undefined,
  method: "cash" as PaymentMethod,
  date: new Date().toISOString().split("T")[0],
  externalReference: "",
  notes: "",
});

const paymentMethods = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

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
  // Pending and overdue both take money; paid and waived do not.
  return invoices.value
    .filter((invoice) => invoice.status === "pending" || invoice.status === "overdue")
    .map((invoice) => ({
      value: invoice.id,
      label: `Factură #${invoice.id} - ${invoice.parent?.firstName} ${invoice.parent?.lastName} - ${formatMonth(invoice.monthIssued)} - ${invoice.amount} RON`,
    }));
});

// Picking an invoice prefills the amount with its total — the common case is paying in full, and
// a partial payment is one keystroke away.
watch(
  () => formState.invoiceId,
  (selected) => {
    if (!selected) return;
    const invoice = invoices.value.find((i) => i.id === selected.value);
    if (invoice) formState.amount = invoice.amount;
  }
);

const canSubmit = computed(
  () =>
    Boolean(formState.invoiceId) &&
    Boolean(formState.date) &&
    typeof formState.amount === "number" &&
    formState.amount > 0 &&
    !isLoading.value
);

const loadInvoices = async () => {
  isLoadingInvoices.value = true;
  try {
    await invoiceApi.fetchInvoices();
    invoices.value = invoiceApi.getInvoices();
  } catch (err) {
    error("Eroare", apiErrorMessage(err, "Nu s-au putut încărca facturile"));
  } finally {
    isLoadingInvoices.value = false;
  }
};

const createPayment = async () => {
  if (!canSubmit.value || !formState.invoiceId) return;

  isLoading.value = true;
  try {
    await paymentsApi.createPayment({
      invoiceId: formState.invoiceId.value,
      amount: formState.amount!,
      method: formState.method,
      date: formState.date as string,
      externalReference: formState.externalReference || undefined,
      notes: formState.notes || undefined,
    });

    success("Succes", "Plata a fost înregistrată");
    navigateTo("/admin/payments");
  } catch (err) {
    error("Eroare", apiErrorMessage(err, "Nu s-a putut înregistra plata"));
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadInvoices();
});
</script>
