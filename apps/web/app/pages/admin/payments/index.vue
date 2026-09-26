<template>
  <AdminPage
    title="Plăți"
    subtitle="Încasările lunii, oricare ar fi metoda — și, din orice lună, ce mai așteaptă pe cineva"
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
        {{ payments.length }} pe ecran
      </UBadge>
    </template>

    <!--
      One month at a time, by the payments' own dates (review of 26 September 2026): the whole
      history was 1.9 GB of browser memory at three years. What still waits on somebody comes along
      whatever its month, and the line under the switcher says so.
    -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-lucide-chevron-left"
        class="min-h-11"
        :aria-label="`Plățile din ${formatMonth(shiftMonth(month, -1))}`"
        @click="goToMonth(-1)"
      />
      <span class="font-medium min-w-36 text-center" aria-live="polite">{{
        formatMonth(month)
      }}</span>
      <UButton
        variant="ghost"
        color="neutral"
        icon="i-lucide-chevron-right"
        class="min-h-11"
        :aria-label="`Plățile din ${formatMonth(shiftMonth(month, 1))}`"
        @click="goToMonth(1)"
      />
      <UButton
        v-if="month !== currentMonth"
        variant="link"
        size="sm"
        class="min-h-11"
        @click="goToMonth(0)"
      >
        Luna curentă
      </UButton>
      <p v-if="fromOtherMonths" class="text-sm text-muted w-full">
        Plus {{ fromOtherMonths }} din alte luni care așteaptă pe cineva — transferuri anunțate
        neconfirmate sau încasări de verificat în SmartBill.
      </p>
    </div>

    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <!--
        E16/S5: where the payments stand with SmartBill, said once above the table. Only in `live`
        do payments go there at all — a draft invoice has no number to record a collection on — so
        outside it the line says exactly that instead of showing a queue that never moves.
      -->
      <div v-if="fiscalQueue" class="mb-4 text-sm text-muted" role="status">
        <p v-if="fiscalQueue.mode !== 'live'">
          <strong>SmartBill:</strong> plățile nu se trimit în modul „{{
            fiscalQueue.mode === "draft" ? "ciorne" : "oprit"
          }}” — se înregistrează doar aici.
        </p>
        <p v-else>
          <strong>SmartBill:</strong> fiecare plată ajunge singură pe factura ei — numerarul ca
          chitanță pe seria {{ fiscalQueue.receiptSeries ?? "—" }}, transferul fără document.
          <template v-if="fiscalSummary"> Acum: {{ fiscalSummary }}.</template>
        </p>
        <p v-if="fiscalQueue.missing.length" class="text-error">
          Lipsesc setările {{ fiscalQueue.missing.join(", ") }} — plățile așteaptă în coadă.
        </p>
        <p v-if="fiscalQueue.lockedUntil" class="text-warning">
          SmartBill a blocat temporar accesul pentru prea multe cereri; coada reia singură după
          {{ formatTime(fiscalQueue.lockedUntil) }}.
        </p>
      </div>

      <!--
        The empty state belongs to `AdminTable` now. Until E18/S6 measured it, this screen had no
        `catch` at all: a dead API left `payments` empty and the table drew its own untranslated
        "no rows" — a sentence about money, on the screen somebody opens to check whether a family
        has paid.
      -->
      <AdminTable
        :rows="payments"
        :columns="columns"
        :actions="rowActions"
        empty-icon="i-lucide-banknote"
        :empty-text="`Nicio plată în ${formatMonth(month)}.`"
        empty-description="Încasările apar aici pe măsură ce sunt înregistrate; săgețile duc la alte luni."
      >
        <template #fiscal-cell="{ row }">
          <span v-if="!row.original.fiscalStatus" class="text-muted">—</span>
          <div v-else class="flex flex-col gap-1">
            <UBadge
              :color="PAYMENT_FISCAL_STATUS_COLORS[row.original.fiscalStatus]"
              variant="subtle"
              class="self-start"
            >
              {{ fiscalLabel(row.original) }}
              <template v-if="row.original.fiscalReceiptNumber">
                &nbsp;{{ row.original.fiscalReceiptSeries }} {{ row.original.fiscalReceiptNumber }}
              </template>
            </UBadge>
            <span
              v-if="row.original.fiscalLastError && row.original.fiscalStatus !== 'recorded'"
              class="text-xs text-muted max-w-xs whitespace-normal"
            >
              {{ row.original.fiscalLastError }}
            </span>
          </div>
        </template>
      </AdminTable>
    </template>

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

    <AdminConfirmModal
      v-model:open="reverseOpen"
      title="Stornezi plata?"
      confirm-label="Stornează"
      danger
      :loading="reversing"
      @confirm="confirmReverse"
    >
      <template #body>
        <p class="text-sm">
          Plata rămâne în evidență ca stornată, iar factura se recalculează fără ea — cum se
          consemnează un transfer întors sau o sumă înregistrată greșit.
        </p>
        <p v-if="reverseTarget?.fiscalStatus" class="text-sm mt-2">
          <strong>În SmartBill încasarea rămâne</strong> până o ștergi de acolo; raportul de
          divergențe o arată până atunci.
        </p>
      </template>
    </AdminConfirmModal>

    <!--
      E16/S6: an announced transfer, arriving. This is the moment the family can honestly be told —
      the receipt goes out from here, and the invoice counts the money from here.
    -->
    <AdminConfirmModal
      v-model:open="arrivalOpen"
      title="Au intrat banii?"
      confirm-label="Au intrat"
      :loading="arriving"
      @confirm="confirmArrival"
    >
      <template #body>
        <p class="text-sm">
          Transferul de {{ arrivalTarget ? formatLei(arrivalTarget.amount) : "" }} de la
          {{ arrivalTarget ? familyOf(arrivalTarget) : "" }} devine încasat: factura îl numără de
          acum, iar familia primește confirmarea pe email.
        </p>
        <UFormField label="Ziua în care au intrat banii" class="mt-4" required>
          <AdminDateField
            v-model="arrivalDate"
            :max="todayKey()"
            label="ziua în care au intrat banii"
          />
        </UFormField>
      </template>
    </AdminConfirmModal>

    <AdminConfirmModal
      v-model:open="notArrivedOpen"
      title="Transferul n-a mai venit?"
      confirm-label="N-a venit"
      danger
      :loading="markingNotArrived"
      @confirm="confirmNotArrived"
    >
      <template #body>
        <p class="text-sm">
          Plata rămâne în registru ca eșuată, iar factura rămâne de plată — mementourile către
          familie se reiau de la următoarea zi din calendarul lor.
        </p>
      </template>
    </AdminConfirmModal>

    <AdminConfirmModal
      v-model:open="confirmOpen"
      title="Încasarea e în SmartBill?"
      confirm-label="E acolo"
      :loading="confirming"
      @confirm="confirmRecorded"
    >
      <template #body>
        <p class="text-sm">
          Răspunsul SmartBill s-a pierdut, iar pe factură suma încasată s-a schimbat. Verifică în
          SmartBill Cloud încasările facturii și confirmă doar ce vezi acolo.
        </p>
        <UFormField
          v-if="confirmTarget?.method === 'cash'"
          label="Numărul chitanței, așa cum apare în SmartBill"
          class="mt-4"
        >
          <UInput v-model="receiptNumber" inputmode="numeric" placeholder="0007" />
        </UFormField>
        <p v-if="confirmError" class="text-sm text-error mt-2" role="alert">{{ confirmError }}</p>
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
import type { Payment, PaymentFiscalQueueStatus } from "~/types/payment.types";
import { formatLei, formatMonth } from "~/composables/useAdminFormat";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { monthRange, paymentsOnScreen, shiftMonth } from "~/composables/usePaymentMonth";
import {
  PAYMENT_FISCAL_STATUS_COLORS,
  PAYMENT_FISCAL_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_RECORD_MAY_EXIST,
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
} from "~/types/payment.types";

const paymentsApi = usePaymentsApi();
const { success, error } = useNotifications();

const payments: Ref<Payment[]> = ref([]);
const fiscalQueue = ref<PaymentFiscalQueueStatus | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Plăților",
});

/** The month on screen, `YYYY-MM`, by the school's calendar; the current one first. */
const currentMonth = todayKey().slice(0, 7);
const month = ref(currentMonth);
/** How many of the rows are there for waiting on somebody, not for their month. */
const fromOtherMonths = ref(0);

const goToMonth = (delta: number) => {
  month.value = delta === 0 ? currentMonth : shiftMonth(month.value, delta);
  void load();
};

const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    const [inMonth, waiting, queue] = await Promise.all([
      paymentsApi.fetchPayments(monthRange(month.value)),
      paymentsApi.fetchPayments({ needsAction: true }),
      // The queue line is a courtesy: a screen about money must not fail because SmartBill's
      // summary could not be read.
      paymentsApi.fetchFiscalQueue().catch(() => null),
    ]);
    fiscalQueue.value = queue;
    // Newest first, and a fresh array: what comes back from the API is sorted here, not in place
    // in a store (`readonly(...)` plus `Array.sort` sorted nothing for a long time — CLAUDE.md).
    const onScreen = paymentsOnScreen(month.value, inMonth, waiting);
    payments.value = onScreen.rows;
    fromOtherMonths.value = onScreen.fromOtherMonths;
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca plățile.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

/** "3 în coadă, 1 de verificat" — only the states somebody might want to act on or wait for. */
const fiscalSummary = computed(() => {
  const queue = fiscalQueue.value;
  if (!queue) return "";
  const parts: string[] = [];
  const pending = queue.counts.pending + queue.counts.uncertain;
  if (pending) parts.push(`${pending} în coadă`);
  if (queue.waitingForInvoice) parts.push(`${queue.waitingForInvoice} așteaptă factura fiscală`);
  if (queue.counts.review) parts.push(`${queue.counts.review} de verificat`);
  if (queue.counts.failed) parts.push(`${queue.counts.failed} refuzate`);
  return parts.join(", ");
});

/**
 * A pending payment whose invoice SmartBill has not numbered yet is waiting on the invoice, not on
 * the queue — worth saying, since the fix (if any) is on the invoice's row.
 */
const fiscalLabel = (payment: Payment) => {
  if (!payment.fiscalStatus) return "";
  if (payment.fiscalStatus === "pending" && payment.invoice?.fiscalStatus !== "issued") {
    return "Așteaptă factura";
  }
  return PAYMENT_FISCAL_STATUS_LABELS[payment.fiscalStatus];
};

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });

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
  // The day the money moved — the screen is a month of them, and a row without its day could not
  // be matched against the bank's statement (QA of 26 September 2026).
  { key: "date", label: "Data", icon: "i-lucide-calendar-days", type: "date" },
  // The payment's own figure, not the invoice total — since E16/S1 the two can differ, and the
  // difference (an instalment) is exactly what this column exists to show.
  { key: "amount", label: "Sumă", type: "money" },
  { key: "externalReference", label: "Referință" },
  // Drawn by the `#fiscal-cell` slot: a badge, the receipt number and SmartBill's own sentence.
  { key: "fiscal", label: "SmartBill" },
];

const holdsRecord = (payment: Payment) =>
  payment.fiscalStatus !== null && PAYMENT_RECORD_MAY_EXIST.includes(payment.fiscalStatus);

const rowActions = (payment: Payment): DropdownMenuItem[] => {
  const items: DropdownMenuItem[] = [];
  // E16/S6: the two ways an announced transfer ends. Until tester 5 of 25 September 2026 found it,
  // no screen could record one or confirm it — the flow existed only on the API.
  if (payment.status === "initiated") {
    items.push({
      label: "Confirmă că banii au intrat",
      icon: "i-lucide-circle-check",
      onSelect: () => askArrival(payment),
    });
    items.push({
      label: "Transferul n-a venit",
      icon: "i-lucide-circle-x",
      color: "error",
      onSelect: () => askNotArrived(payment),
    });
  }
  if (payment.fiscalStatus === "review") {
    items.push({
      label: "Confirmă în SmartBill",
      icon: "i-lucide-badge-check",
      onSelect: () => askConfirm(payment),
    });
  }
  if (payment.fiscalStatus === "failed" || payment.fiscalStatus === "review") {
    items.push({
      label: "Retrimite în SmartBill",
      icon: "i-lucide-refresh-cw",
      onSelect: () => retry(payment),
    });
  }
  if (payment.status === "succeeded") {
    items.push({
      label: "Stornează plata",
      icon: "i-lucide-undo-2",
      color: "error",
      onSelect: () => askReverse(payment),
    });
  }
  // E16/S5: a collection SmartBill holds is reversed, never deleted — SmartBill would keep a
  // record of money the platform no longer has.
  if (!holdsRecord(payment)) {
    items.push({
      label: "Șterge plata",
      icon: "i-lucide-trash",
      color: "error",
      onSelect: () => askDelete(payment),
    });
  }
  return items;
};

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

const reverseTarget = ref<Payment | null>(null);
const reverseOpen = ref(false);
const reversing = ref(false);

const askReverse = (payment: Payment) => {
  reverseTarget.value = payment;
  reverseOpen.value = true;
};

const confirmReverse = async () => {
  const payment = reverseTarget.value;
  if (!payment) return;
  reversing.value = true;
  try {
    await paymentsApi.updatePayment(payment.id, { status: "reversed" });
    reverseOpen.value = false;
    success("Plată stornată");
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la stornarea plății"));
  } finally {
    reversing.value = false;
  }
};

const familyOf = (payment: Payment) =>
  `${payment.invoice?.parent?.firstName ?? ""} ${payment.invoice?.parent?.lastName ?? ""}`.trim();

const arrivalTarget = ref<Payment | null>(null);
const arrivalOpen = ref(false);
const arriving = ref(false);
const arrivalDate = ref<string | undefined>(undefined);

const askArrival = (payment: Payment) => {
  arrivalTarget.value = payment;
  // The day it was announced, which is usually the day it lands; the statement says otherwise
  // often enough that the field is there to correct it.
  arrivalDate.value = String(payment.date).slice(0, 10);
  arrivalOpen.value = true;
};

const confirmArrival = async () => {
  const payment = arrivalTarget.value;
  if (!payment || !arrivalDate.value) return;
  // The field's `max` stops the picker, not the keyboard: a typed 30 September on the 26th sent the
  // family „Am primit 350 lei pe 30 septembrie" (QA of 26 September 2026).
  if (arrivalDate.value > todayKey()) {
    error("Ziua în care au intrat banii nu poate fi în viitor.");
    return;
  }
  arriving.value = true;
  try {
    await paymentsApi.updatePayment(payment.id, { status: "succeeded", date: arrivalDate.value });
    arrivalOpen.value = false;
    success("Plată încasată", `${formatLei(payment.amount)} de la ${familyOf(payment)}`);
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut confirma plata"));
  } finally {
    arriving.value = false;
  }
};

const notArrivedTarget = ref<Payment | null>(null);
const notArrivedOpen = ref(false);
const markingNotArrived = ref(false);

const askNotArrived = (payment: Payment) => {
  notArrivedTarget.value = payment;
  notArrivedOpen.value = true;
};

const confirmNotArrived = async () => {
  const payment = notArrivedTarget.value;
  if (!payment) return;
  markingNotArrived.value = true;
  try {
    await paymentsApi.updatePayment(payment.id, { status: "failed" });
    notArrivedOpen.value = false;
    success("Transferul e marcat ca nevenit");
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut marca transferul"));
  } finally {
    markingNotArrived.value = false;
  }
};

const retry = async (payment: Payment) => {
  try {
    await paymentsApi.retryFiscal(payment.id);
    success("Plata pleacă din nou spre SmartBill");
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut retrimite plata"));
  }
};

/**
 * "It is there" — the way out of a lost answer. A cash payment needs the receipt's number as the
 * person reads it in SmartBill; the probable one is offered, never assumed.
 */
const confirmTarget = ref<Payment | null>(null);
const confirmOpen = ref(false);
const confirming = ref(false);
const confirmError = ref<string | null>(null);
const receiptNumber = ref("");

const askConfirm = (payment: Payment) => {
  confirmTarget.value = payment;
  confirmError.value = null;
  receiptNumber.value =
    payment.method === "cash" && payment.fiscalExpectedNumber !== null
      ? String(payment.fiscalExpectedNumber).padStart(4, "0")
      : "";
  confirmOpen.value = true;
};

const confirmRecorded = async () => {
  const payment = confirmTarget.value;
  if (!payment) return;
  confirming.value = true;
  confirmError.value = null;
  try {
    await paymentsApi.confirmFiscal(
      payment.id,
      payment.method === "cash" ? { number: receiptNumber.value.trim() } : {}
    );
    confirmOpen.value = false;
    success("Încasarea e confirmată în SmartBill");
    await load();
  } catch (err: unknown) {
    confirmError.value = apiErrorMessage(err, "Nu am putut confirma încasarea");
  } finally {
    confirming.value = false;
  }
};
</script>
