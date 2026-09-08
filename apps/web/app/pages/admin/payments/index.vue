<template>
  <AdminPage
    title="Plăți"
    subtitle="Toate încasările înregistrate, oricare ar fi metoda"
    width="xl"
  >
    <template #actions>
      <UButton
        color="secondary"
        variant="subtle"
        size="lg"
        class="min-h-11 flex items-center"
        icon="i-lucide-circle-fading-plus"
        to="/admin/payments/new"
      >
        Adaugă plată nouă
      </UButton>
      <UBadge color="primary" variant="subtle" size="lg" class="min-h-11 flex items-center px-4">
        {{ payments.length }} total
      </UBadge>
    </template>

    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <!--
      The empty state belongs to `AdminTable` now. Until E18/S6 measured it, this screen had no
      `catch` at all: a dead API left `payments` empty and the table drew its own untranslated
      "no rows" — a sentence about money, on the screen somebody opens to check whether a family
      has paid.
    -->
    <AdminTable
      v-else
      :rows="payments"
      :columns="columns"
      :actions="rowActions"
      empty-icon="i-lucide-banknote"
      empty-text="Nicio plată înregistrată."
      empty-description="Încasările apar aici pe măsură ce sunt înregistrate."
    />

    <AdminConfirmModal
      v-model:open="deleteOpen"
      title="Ștergi plata?"
      confirm-label="Șterge"
      danger
      :loading="deleting"
      @confirm="confirmDelete"
    >
      <template #body>
        <p class="text-sm">
          Încasarea dispare din evidență, iar factura se recalculează fără ea. Chitanța deja trimisă
          familiei nu se retrage.
        </p>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { AdminTableColumn } from "~/types/admin-ui.types";
import { apiErrorMessage } from "~/composables/useApiError";
import { useNotifications } from "~/composables/useNotifications";
import { usePaymentsApi } from "~/composables/api/usePaymentsApi";
import type { Payment } from "~/types/payment.types";
import { usePaymentsStore } from "~/stores/paymentsStore";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
} from "~/types/payment.types";

const paymentsApi = usePaymentsApi();
const paymentsStore = usePaymentsStore();
const { success, error } = useNotifications();

const payments: Ref<Payment[]> = ref([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Plăților",
});

const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    await paymentsApi.fetchPayments();
    // A copy before sorting. `paymentsStore.payments` is `readonly(...)` and `Array.sort` reorders
    // in place, so every swap is a write Vue refuses — eighteen warnings deep — and what comes back
    // is the list in its original order, pretending to be sorted. The screen has always claimed
    // newest first and always shown API order.
    payments.value = [...(paymentsStore.payments as Payment[])].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca plățile.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

/**
 * The columns, as config rather than sixty lines of `h()` — E18/S5b, last of the seven dialects.
 *
 * Two things change for the reader, both from `AdminTable` owning the vocabulary: an unfilled name
 * or month reads as `—` like everywhere else in the admin area rather than `N/A`, and the actions
 * button is announced as "Acțiuni" rather than "Actions dropdown". The second was a plain
 * convention break — the rule is English everywhere except what a person sees, and a screen
 * reader's label is what a person hears.
 */
const columns: AdminTableColumn<Payment>[] = [
  { key: "id", label: "#", type: "id" },
  {
    key: "name",
    label: "Nume",
    icon: "i-lucide-user",
    accessor: (payment) =>
      `${payment.invoice?.parent?.firstName ?? ""} ${payment.invoice?.parent?.lastName ?? ""}`.trim(),
  },
  {
    key: "monthIssued",
    label: "Luna",
    icon: "i-lucide-calendar",
    accessor: (payment) => payment.invoice?.monthIssued,
  },
  {
    key: "method",
    label: "Metodă",
    icon: "i-lucide-wallet-minimal",
    type: "badge",
    accessor: (payment) => PAYMENT_METHOD_LABELS[payment.method],
    badgeColor: (payment) => (payment.method === "cash" ? "secondary" : "primary"),
  },
  {
    key: "status",
    label: "Stare",
    type: "badge",
    accessor: (payment) => PAYMENT_STATUS_LABELS[payment.status],
    badgeColor: (payment) => PAYMENT_STATUS_COLORS[payment.status],
  },
  // The payment's own figure, not the invoice total — since E16/S1 the two can differ, and the
  // difference (an instalment) is exactly what this column exists to show.
  { key: "amount", label: "Sumă", type: "money" },
  { key: "externalReference", label: "Referință" },
];

const rowActions = (payment: Payment): DropdownMenuItem[] => [
  {
    label: "Șterge plata",
    icon: "i-lucide-trash",
    color: "error",
    onSelect: () => askDelete(payment),
  },
];

/**
 * Deleting a payment asks first, and waits for the answer.
 *
 * It used to do neither: one press on a menu item fired `deletePayment` without `await`, navigated
 * away, and filtered the row out of the local list. So a delete the API refused still disappeared
 * from the screen — the family's payment looked gone and was not — and there was no confirmation in
 * front of a one-click, irreversible write about money.
 */
const deleteTarget = ref<Payment | null>(null);
const deleteOpen = ref(false);
const deleting = ref(false);

const askDelete = (payment: Payment) => {
  deleteTarget.value = payment;
  deleteOpen.value = true;
};

const confirmDelete = async () => {
  const payment = deleteTarget.value;
  if (!payment) return;
  deleting.value = true;
  try {
    await paymentsApi.deletePayment(payment.id);
    payments.value = payments.value.filter((row) => row.id !== payment.id);
    deleteOpen.value = false;
    success("Plată ștearsă");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la ștergerea plății"));
  } finally {
    deleting.value = false;
  }
};
</script>
