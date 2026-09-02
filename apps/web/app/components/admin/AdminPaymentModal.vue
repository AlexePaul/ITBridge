<template>
  <AdminConfirmModal
    v-model:open="open"
    title="Înregistrează încasarea"
    confirm-label="Înregistrează"
    :loading="saving"
    @confirm="submit"
  >
    <template #body>
      <div v-if="row" class="space-y-4">
        <!-- What is being paid, spelled out. The admin arrived here from a list of twenty rows and
             the only way to be sure this is the right family is to read it back. -->
        <div class="border border-muted rounded-lg p-3">
          <p class="font-medium">{{ row.parentName }}</p>
          <p class="text-sm text-muted tabular-nums">
            Factura #{{ row.invoiceId }} · {{ formatMonth(row.monthIssued) }} ·
            {{ formatLei(row.amount) }}
          </p>
          <p v-if="row.paid > 0" class="text-sm text-muted tabular-nums">
            A plătit deja {{ formatLei(row.paid) }} — rest {{ formatLei(row.outstanding) }}
          </p>
        </div>

        <UFormField label="Suma încasată (lei)" name="amount" required>
          <UInput v-model.number="amount" type="number" min="0.01" step="0.01" class="w-full" />
        </UFormField>

        <UFormField label="Metodă" name="method">
          <USelect v-model="method" :items="methodItems" class="w-full" />
        </UFormField>

        <UFormField
          v-if="method === 'bank_transfer'"
          label="Referință (nr. OP)"
          name="externalReference"
          help="Numărul ordinului de plată — singurul lucru după care încasarea se regăsește în extras."
        >
          <UInput v-model="externalReference" placeholder="OP 1234" class="w-full" />
        </UFormField>

        <UFormField label="Data plății" name="date" required>
          <UInput v-model="date" type="date" class="w-full" />
        </UFormField>

        <UFormField label="Observații" name="notes">
          <UInput v-model="notes" placeholder="Opțional" class="w-full" />
        </UFormField>

        <p v-if="amount && amount > row.outstanding" class="text-sm text-warning">
          Suma depășește restul de plată cu {{ formatLei(round(amount - row.outstanding)) }}. Se
          înregistrează așa cum e tastată.
        </p>
      </div>
    </template>
  </AdminConfirmModal>
</template>

<script setup lang="ts">
import { usePaymentsApi } from "~/composables/api/usePaymentsApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatLei, formatMonth } from "~/composables/useAdminFormat";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { paymentDraftFor } from "~/composables/usePaymentDraft";
import type { ArrearsRow } from "~/types/arrears.types";
import type { PaymentMethod } from "~/types/payment.types";
import { PAYMENT_METHOD_LABELS } from "~/types/payment.types";

/**
 * Recording money that arrived — E16/S5.
 *
 * **Opened from the invoice, never from a blank form.** The real case is an admin reading a bank
 * statement with twenty lines and working out whose each one is; a form that asks them to find the
 * invoice and retype the sum for every line is a form that stops being filled in, and then the
 * platform's idea of who has paid becomes fiction. So the caller hands over the row it already
 * shows and this fills itself in.
 *
 * The prefilled sum is the **outstanding** amount, not the invoice total. A family who paid 200 of
 * 350 and now pays the rest would otherwise have 350 typed for them, and the register would show
 * 550 received against a 350 invoice. The row's own arithmetic is used rather than repeated:
 * `outstanding` is computed once, by the service that owns the question.
 */
const props = defineProps<{ row: ArrearsRow | null }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ recorded: [] }>();

const paymentsApi = usePaymentsApi();
const { error, success } = useNotifications();

const saving = ref(false);
const amount = ref<number | undefined>(undefined);
const method = ref<PaymentMethod>("cash");
const date = ref(todayKey());
const externalReference = ref("");
const notes = ref("");

const methodItems = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

const round = (value: number) => Math.round(value * 100) / 100;

// Every opening starts from the row, not from whatever the last one was left at: a stale amount
// from the previous family is the one mistake this screen must not make.
watch(
  () => [open.value, props.row?.invoiceId] as const,
  () => {
    if (!open.value || !props.row) return;
    const draft = paymentDraftFor(props.row, todayKey());
    amount.value = draft.amount;
    method.value = draft.method;
    date.value = draft.date;
    externalReference.value = draft.externalReference;
    notes.value = draft.notes;
  },
  { immediate: true }
);

const submit = async () => {
  const row = props.row;
  if (!row || typeof amount.value !== "number" || amount.value <= 0 || !date.value) return;

  saving.value = true;
  try {
    await paymentsApi.createPayment({
      invoiceId: row.invoiceId,
      amount: amount.value,
      method: method.value,
      date: date.value,
      externalReference: externalReference.value || undefined,
      notes: notes.value || undefined,
    });
    success("Încasare înregistrată", `${formatLei(amount.value)} de la ${row.parentName}`);
    open.value = false;
    emit("recorded");
  } catch (err) {
    error("Eroare", apiErrorMessage(err, "Nu s-a putut înregistra încasarea"));
  } finally {
    saving.value = false;
  }
};
</script>
