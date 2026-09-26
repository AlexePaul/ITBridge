<template>
  <AdminPage
    title="Reconciliere"
    subtitle="Extrasul băncii și SmartBill, ținute față în față cu evidența platformei"
    width="xl"
  >
    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <!--
        E16/S8's first half: the bank statement. "Import de extras bancar cu potrivire automată
        după sumă, dată și referință; ce nu se potrivește ajunge într-o coadă pentru decizie
        umană." Nothing is recorded without a person — a proposal is confirmed, one line at a time
        or every sure one with a press.
      -->
      <section aria-labelledby="statement-heading" class="flex flex-col gap-4 mb-12">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="statement-heading" class="text-lg font-semibold">Extrasul bancar</h2>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="linesPage && linesPage.sureCount > 0 && state === 'waiting'"
              color="primary"
              icon="i-lucide-check-check"
              class="min-h-11"
              :loading="confirmingSure"
              @click="confirmSure"
            >
              Confirmă potrivirile după numărul facturii ({{ linesPage.sureCount }})
            </UButton>
            <UButton
              color="secondary"
              variant="subtle"
              icon="i-lucide-upload"
              class="min-h-11"
              :loading="importing"
              @click="pickFile"
            >
              Importă un extras (CSV)
            </UButton>
            <!-- Out of the Tab order and the accessibility tree: the button above is how anyone
                 reaches it. In both, it was a second stop right after the button, invisible and
                 unindicated, and a second control a screen reader read out for the same act. -->
            <input
              ref="fileInput"
              type="file"
              accept=".csv,.txt,text/csv"
              class="sr-only"
              tabindex="-1"
              aria-hidden="true"
              @change="onFile"
            />
          </div>
        </div>

        <p class="text-sm text-muted">
          Exportă extrasul din bancă în CSV, o lună o dată. Se păstrează doar încasările, iar un
          extras importat de două ori nu adaugă nimic. Potrivirea sigură e după numărul facturii
          fiscale scris de familie în detaliile transferului — portalul i-l cere; cealaltă, după
          numele plătitorului și suma rămasă, e doar o propunere.
        </p>

        <div v-if="lastImport" class="text-sm" role="status">
          <p>
            <strong>{{
              lastImport.imported === 1 ? "O încasare nouă" : `${lastImport.imported} încasări noi`
            }}</strong>
            din {{ lastImport.credits
            }}<template v-if="lastImport.duplicates">
              ({{ lastImport.duplicates }} erau deja importate)</template
            >;
            {{
              lastImport.debits === 1
                ? "o plată ieșită pusă deoparte"
                : `${lastImport.debits} plăți ieșite puse deoparte`
            }}.
            <template v-if="lastImport.imported">
              Cu propunere: {{ lastImport.suggested }} din {{ lastImport.imported }} ({{
                Math.round((lastImport.suggested / lastImport.imported) * 100)
              }}%), dintre care {{ lastImport.suggestedByReference }} după numărul facturii.
            </template>
          </p>
          <p class="text-muted">
            Coloanele folosite: data din „{{ lastImport.columns.date }}”, suma din „{{
              lastImport.columns.amount
            }}”<template v-if="lastImport.columns.description"
              >, detaliile din „{{ lastImport.columns.description }}”</template
            >.
          </p>
          <ul v-if="lastImport.unreadable.length" class="text-warning mt-1">
            <li v-for="problem in lastImport.unreadable" :key="problem.row">
              Rândul {{ problem.row }} nu s-a putut citi:
              {{ describeUnreadableRow(problem.problem, problem.cell) }}.
            </li>
          </ul>
        </div>

        <div class="flex flex-wrap gap-2" role="group" aria-label="Ce linii se văd">
          <UButton
            v-for="option in STATES"
            :key="option"
            :color="state === option ? 'primary' : 'neutral'"
            :variant="state === option ? 'solid' : 'ghost'"
            class="min-h-11"
            :aria-pressed="state === option"
            @click="showState(option)"
          >
            {{ STATEMENT_LINE_STATE_LABELS[option] }}
            <template v-if="linesPage"> ({{ linesPage.counts[option] }})</template>
          </UButton>
        </div>

        <AdminLoading v-if="linesLoading" />
        <AdminTable
          v-else-if="linesPage"
          :rows="linesPage.lines"
          :columns="lineColumns"
          :actions="state === 'matched' ? undefined : lineActions"
          empty-icon="i-lucide-landmark"
          :empty-text="EMPTY_TEXT[state]"
        >
          <template #match-cell="{ row }">
            <div class="flex flex-col gap-1 whitespace-normal max-w-sm">
              <template v-if="row.original.payment">
                <span>
                  Plata #{{ row.original.payment.id }} · {{ row.original.payment.familyName }} ·
                  {{ formatMonth(row.original.payment.monthIssued) }}
                </span>
              </template>
              <template v-else-if="row.original.suggestion">
                <span>
                  {{ referenceOf(row.original.suggestion) }} ·
                  {{ row.original.suggestion.familyName }} ·
                  {{ formatMonth(row.original.suggestion.monthIssued) }} · rest
                  {{ formatLei(row.original.suggestion.outstanding) }}
                </span>
                <UBadge
                  :color="
                    row.original.suggestion.confidence === 'reference' ? 'success' : 'warning'
                  "
                  variant="subtle"
                  class="self-start"
                >
                  {{ MATCH_CONFIDENCE_LABELS[row.original.suggestion.confidence] }}
                </UBadge>
                <span v-if="row.original.suggestion.overpays" class="text-xs text-warning">
                  Suma depășește restul facturii — diferența ar rămâne ca avans.
                </span>
              </template>
              <span v-else class="text-muted">—</span>
            </div>
          </template>
        </AdminTable>
      </section>

      <!--
        E16/S8's second half: "divergențele dintre sisteme apar într-un raport, nu într-o surpriză
        la finalul lunii". SmartBill's side is what was read last, a day apart at most; the verdict
        is made now, against the payments as they stand.
      -->
      <section v-if="report" aria-labelledby="smartbill-heading" class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 id="smartbill-heading" class="text-lg font-semibold">SmartBill</h2>
          <UButton
            color="secondary"
            variant="subtle"
            icon="i-lucide-refresh-cw"
            class="min-h-11"
            :loading="refreshing"
            :disabled="report.mode !== 'live'"
            @click="refresh"
          >
            Recitește toate facturile
          </UButton>
        </div>

        <div class="text-sm text-muted" role="status">
          <p v-if="report.mode !== 'live'">
            Raportul citește SmartBill doar când platforma emite facturi fiscale (modul „live”);
            acum nu se citește nimic.
          </p>
          <template v-else>
            <p>
              {{ report.issued }} facturi emise în SmartBill<template v-if="report.unchecked">
                · {{ report.unchecked }} încă necitite de la ultima schimbare</template
              ><template v-if="report.oldestCheckAt">
                · cea mai veche citire: {{ formatStamp(report.oldestCheckAt) }}</template
              >.
            </p>
            <p v-if="report.missing.length" class="text-error">
              Lipsesc setările {{ report.missing.join(", ") }} — nu se citește nimic din SmartBill.
            </p>
            <p v-if="report.lockedUntil" class="text-warning">
              SmartBill a blocat temporar accesul pentru prea multe cereri; citirile reiau după
              {{ formatStamp(report.lockedUntil) }}.
            </p>
          </template>
        </div>

        <AdminTable
          :rows="report.rows"
          :columns="divergenceColumns"
          empty-icon="i-lucide-scale"
          empty-text="Nicio divergență."
          empty-description="Facturile citite din SmartBill spun același lucru ca platforma."
        >
          <template #reasons-cell="{ row }">
            <ul class="flex flex-col gap-1 whitespace-normal max-w-md">
              <li v-for="reason in row.original.reasons" :key="reason" class="text-sm">
                {{ DIVERGENCE_REASON_LABELS[reason] }}
              </li>
            </ul>
          </template>
        </AdminTable>
      </section>
    </template>

    <AdminConfirmModal
      v-model:open="pickOpen"
      title="Pe ce factură intră încasarea?"
      confirm-label="Înregistrează plata"
      :loading="matching"
      @confirm="confirmPick"
    >
      <template #body>
        <p v-if="pickTarget" class="text-sm mb-4">
          {{ formatLei(pickTarget.amount) }} din {{ formatDateKey(pickTarget.bookedOn) }} —
          {{ pickTarget.counterparty ?? pickTarget.description }}
        </p>
        <UFormField label="Factura" name="invoiceId" required>
          <AdminLoading v-if="openLoading" label="Se încarcă facturile cu rest de plată…" />
          <USelectMenu
            v-else
            v-model="pickInvoiceId"
            :items="openItems"
            value-key="id"
            placeholder="Caută după familie"
            class="w-full"
            aria-label="Factura pe care intră încasarea"
          />
        </UFormField>
        <p class="text-sm text-muted mt-3">
          Se înregistrează ca transfer bancar, cu data din extras: familia primește confirmarea, iar
          plata pleacă spre SmartBill ca orice altă încasare.
        </p>
        <p v-if="pickError" class="text-sm text-error mt-2" role="alert">{{ pickError }}</p>
      </template>
    </AdminConfirmModal>
    <AdminConfirmModal
      v-model:open="overpayOpen"
      title="Factura e deja plătită?"
      confirm-label="Înregistrează totuși"
      danger
      @confirm="overpay && match(overpay.line, overpay.invoiceId, true)"
    >
      <template #body>
        <p>
          Linia de extras plătește mai mult decât mai are de plată factura aleasă — de obicei
          fiindcă familia a plătit între timp altfel. Înregistreaz-o doar dacă au intrat cu adevărat
          două plăți; altfel alege altă factură sau pune linia deoparte.
        </p>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { AdminTableColumn } from "~/types/admin-ui.types";
import type { ArrearsRow } from "~/types/arrears.types";
import { apiErrorCode, apiErrorMessage } from "~/composables/useApiError";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey, formatLei, formatMonth } from "~/composables/useAdminFormat";
import { useReconciliationApi } from "~/composables/api/useReconciliationApi";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { readStatementFile } from "~/composables/useStatementFile";
import {
  DIVERGENCE_REASON_LABELS,
  MATCH_CONFIDENCE_LABELS,
  STATEMENT_LINE_STATE_LABELS,
  describeUnreadableRow,
  type FiscalDivergenceReport,
  type FiscalDivergenceRow,
  type StatementImportResult,
  type StatementLineState,
  type StatementLineSuggestion,
  type StatementLinesPage,
  type StatementLineView,
} from "~/types/reconciliation.types";

/**
 * Reconciliation — E16/S8.
 *
 * The platform keeps the school's record of what was billed and received; the bank and SmartBill
 * each keep one of their own. This screen is where they are held against each other, so a
 * difference is seen here, by somebody who can act on it, rather than at the accountant's desk at
 * the end of the month.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Reconciliere",
});

const reconciliation = useReconciliationApi();
const invoiceApi = useInvoiceApi();
const { success, error } = useNotifications();

const STATES: StatementLineState[] = ["waiting", "matched", "ignored"];
const EMPTY_TEXT: Record<StatementLineState, string> = {
  waiting: "Nicio încasare de decis.",
  matched: "Nicio încasare înregistrată din extras încă.",
  ignored: "Nimic pus deoparte.",
};

/** A statement is about 90 KB for a month of a school; past that, the API refuses it. */
const MAX_STATEMENT_CHARS = 90_000;

const report = ref<FiscalDivergenceReport | null>(null);
const linesPage = ref<StatementLinesPage | null>(null);
const state = ref<StatementLineState>("waiting");
const lastImport = ref<StatementImportResult | null>(null);

const loading = ref(true);
const loadError = ref<string | null>(null);
const linesLoading = ref(false);
const refreshing = ref(false);
const importing = ref(false);
const confirmingSure = ref(false);

const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    const [page, divergences] = await Promise.all([
      reconciliation.fetchLines(state.value),
      reconciliation.fetchDivergences(),
    ]);
    linesPage.value = page;
    report.value = divergences;
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca reconcilierea.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const loadLines = async () => {
  linesLoading.value = true;
  try {
    linesPage.value = await reconciliation.fetchLines(state.value);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut încărca liniile extrasului"));
  } finally {
    linesLoading.value = false;
  }
};

const showState = async (next: StatementLineState) => {
  state.value = next;
  await loadLines();
};

const fileInput = ref<HTMLInputElement | null>(null);
const pickFile = () => fileInput.value?.click();

/** Read in the browser, sent as text: the server parses, so there is one reader of the format. */
const onFile = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  // A summary left from the previous file would read as this file's (QA of 26 September 2026).
  lastImport.value = null;
  const content = await readStatementFile(file);
  if (content.length > MAX_STATEMENT_CHARS) {
    error("Extrasul e prea mare pentru un singur import — exportă-l o lună o dată.");
    return;
  }
  importing.value = true;
  try {
    lastImport.value = await reconciliation.importStatement(content);
    state.value = "waiting";
    await loadLines();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut citi extrasul"));
  } finally {
    importing.value = false;
  }
};

const confirmSure = async () => {
  confirmingSure.value = true;
  try {
    const { confirmed, failed } = await reconciliation.confirmSuggested();
    if (failed)
      error(`${confirmed} încasări înregistrate; ${failed} n-au putut fi — rămân de decis.`);
    else success(`${confirmed} încasări înregistrate`);
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut confirma potrivirile"));
  } finally {
    confirmingSure.value = false;
  }
};

const referenceOf = (suggestion: StatementLineSuggestion) =>
  suggestion.fiscalNumber
    ? `${suggestion.fiscalSeries ?? ""} ${suggestion.fiscalNumber}`.trim()
    : `factura #${suggestion.invoiceId}`;

const lineColumns: AdminTableColumn<StatementLineView>[] = [
  { key: "bookedOn", label: "Data", type: "date" },
  { key: "amount", label: "Suma", type: "money" },
  {
    key: "counterparty",
    label: "Plătitor",
    icon: "i-lucide-user",
    accessor: (line) => line.counterparty ?? "",
  },
  { key: "description", label: "Detalii" },
  // Drawn by the `#match-cell` slot: the proposal with how sure it is, or the payment it became.
  { key: "match", label: "Factura" },
];

const lineActions = (line: StatementLineView): DropdownMenuItem[] => {
  if (line.state === "ignored") {
    return [{ label: "Readu la decis", icon: "i-lucide-undo-2", onSelect: () => reopen(line) }];
  }
  const items: DropdownMenuItem[] = [];
  if (line.suggestion) {
    items.push({
      label: "Confirmă propunerea",
      icon: "i-lucide-check",
      onSelect: () => match(line, line.suggestion!.invoiceId),
    });
  }
  items.push({
    label: "Alege factura",
    icon: "i-lucide-list-search",
    onSelect: () => askPick(line),
  });
  items.push({
    label: "Pune deoparte — nu e o plată de factură",
    icon: "i-lucide-archive",
    onSelect: () => ignore(line),
  });
  return items;
};

/**
 * A proposal can be older than the invoice's last payment: the page is opened, the office takes the
 * same month in cash at the desk, and the proposal still says "rest 350". The server refuses a line
 * that pays more than is owed (QA of 26 September 2026); the office can still record it on purpose —
 * two real payments, one to be given back — after saying so here.
 */
const overpay = ref<{ line: StatementLineView; invoiceId: number } | null>(null);
const overpayOpen = ref(false);

const match = async (line: StatementLineView, invoiceId: number, acceptOverpayment = false) => {
  try {
    await reconciliation.matchLine(line.id, invoiceId, acceptOverpayment);
    overpayOpen.value = false;
    success("Încasare înregistrată");
    await load();
  } catch (err: unknown) {
    if (!acceptOverpayment && apiErrorCode(err) === "STATEMENT_LINE_EXCEEDS_REMAINDER") {
      overpay.value = { line, invoiceId };
      overpayOpen.value = true;
      await load();
      return;
    }
    error(apiErrorMessage(err, "Nu am putut înregistra încasarea"));
  }
};

const ignore = async (line: StatementLineView) => {
  try {
    await reconciliation.ignoreLine(line.id);
    await loadLines();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut pune linia deoparte"));
  }
};

const reopen = async (line: StatementLineView) => {
  try {
    await reconciliation.reopenLine(line.id);
    await loadLines();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut readuce linia"));
  }
};

/**
 * "Alege factura" — the queue's human half. The list is the arrears list, the one definition of an
 * invoice that still owes something, so a line cannot be put on an invoice that is already paid.
 */
const pickOpen = ref(false);
const pickTarget = ref<StatementLineView | null>(null);
const pickInvoiceId = ref<number | undefined>(undefined);
const pickError = ref<string | null>(null);
const matching = ref(false);
const openLoading = ref(false);
const openInvoices = ref<ArrearsRow[]>([]);

const openItems = computed(() =>
  openInvoices.value.map((row) => ({
    id: row.invoiceId,
    label: `${row.parentName} · ${formatMonth(row.monthIssued)} · rest ${formatLei(row.outstanding)}`,
  }))
);

const askPick = async (line: StatementLineView) => {
  pickTarget.value = line;
  pickInvoiceId.value = line.suggestion?.invoiceId;
  pickError.value = null;
  pickOpen.value = true;
  openLoading.value = true;
  try {
    openInvoices.value = await invoiceApi.fetchArrears();
  } catch (err: unknown) {
    pickError.value = apiErrorMessage(err, "Nu am putut încărca facturile cu rest de plată.");
  } finally {
    openLoading.value = false;
  }
};

const confirmPick = async () => {
  const line = pickTarget.value;
  if (!line || !pickInvoiceId.value) {
    pickError.value = "Alege factura pe care intră încasarea.";
    return;
  }
  matching.value = true;
  pickError.value = null;
  try {
    await reconciliation.matchLine(line.id, pickInvoiceId.value);
    pickOpen.value = false;
    success("Încasare înregistrată");
    await load();
  } catch (err: unknown) {
    if (apiErrorCode(err) === "STATEMENT_LINE_EXCEEDS_REMAINDER") {
      pickOpen.value = false;
      overpay.value = { line, invoiceId: pickInvoiceId.value };
      overpayOpen.value = true;
      return;
    }
    pickError.value = apiErrorMessage(err, "Nu am putut înregistra încasarea");
  } finally {
    matching.value = false;
  }
};

/** Nothing is read in the request: the invoices become due and the background passes read them. */
const refresh = async () => {
  refreshing.value = true;
  try {
    const { due } = await reconciliation.refreshDivergences();
    success(`${due} facturi se recitesc din SmartBill în următoarele minute`);
    report.value = await reconciliation.fetchDivergences();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut cere recitirea"));
  } finally {
    refreshing.value = false;
  }
};

const formatStamp = (iso: string) =>
  new Date(iso).toLocaleString("ro-RO", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

const divergenceColumns: AdminTableColumn<FiscalDivergenceRow>[] = [
  {
    key: "invoice",
    label: "Factura",
    icon: "i-lucide-file-text",
    accessor: (row) =>
      `${row.fiscalSeries ?? ""} ${row.fiscalNumber ?? ""}`.trim() +
      ` · ${formatMonth(row.monthIssued)}`,
  },
  { key: "familyName", label: "Familia", icon: "i-lucide-user" },
  {
    key: "platform",
    label: "Platforma",
    accessor: (row) => `${formatLei(row.amount)} · încasat ${formatLei(row.platformPaid)}`,
  },
  {
    key: "smartbill",
    label: "SmartBill",
    accessor: (row) =>
      row.smartbillTotal === null
        ? "—"
        : `${formatLei(row.smartbillTotal)} · încasat ${formatLei(row.smartbillPaid ?? 0)}`,
  },
  // Drawn by the `#reasons-cell` slot: one sentence per reason, each saying where it is fixed.
  { key: "reasons", label: "Ce nu se potrivește" },
  { key: "checkedAt", label: "Citită", accessor: (row) => formatStamp(row.checkedAt) },
];
</script>
