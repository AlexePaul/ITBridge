<template>
  <div class="portal-page">
    <div class="portal-head">
      <span class="kicker">Portalul familiei</span>
      <h1 class="portal-title">Plăți și facturi</h1>
      <!--
        Why two months differ. Without this sentence the variability reads as a mistake — which is
        exactly what it used to be, before pricing moved to the session: the school corrected every
        short month by hand.
      -->
      <p class="lede measure-wide">
        Plata e <strong>pe ședință</strong>: {{ formatLei(FIRST_CHILD_PER_SESSION) }} pentru primul
        copil și {{ formatLei(SIBLING_PER_SESSION) }} pentru fiecare frate. O lună cu vacanță are
        mai puține ședințe — și o factură mai mică.
      </p>
    </div>

    <p v-if="loading" class="portal-empty">Se încarcă…</p>

    <div v-else-if="loadError" class="portal-card portal-card-accent portal-notice" role="alert">
      <p class="body-text">{{ loadError }}</p>
      <UButton variant="outline" class="mt-3 min-h-11" @click="load">Încearcă din nou</UButton>
    </div>

    <template v-else>
      <!--
        Overdue first, and drawn as the one tinted card in the portal: it is the only thing here that
        is not simply information.
      -->
      <div
        v-for="invoice in overdue"
        :key="invoice.id"
        class="portal-card portal-card-alert portal-notice"
      >
        <span class="portal-label">Restantă — scadența a trecut</span>
        <div class="figure-line">
          <p class="portal-card-figure">{{ formatMonth(invoice.monthIssued) }}</p>
          <p class="portal-card-figure tnum">{{ formatLei(leftToPay(invoice)) }}</p>
        </div>
        <p v-if="invoice.paid" class="body-text">
          Ai plătit deja {{ formatLei(invoice.paid) }} din {{ formatLei(invoice.amount) }}; mai
          rămân {{ formatLei(leftToPay(invoice)) }}.
        </p>
        <!-- E16/S2: the fiscal number is the reference a transfer is matched by. -->
        <p v-if="invoice.fiscalNumber" class="body-text measure-wide">
          Factura fiscală
          <span class="tnum">{{ invoice.fiscalSeries }} {{ invoice.fiscalNumber }}</span>
          — la transfer, trece-o în detaliile plății.
        </p>
        <p class="body-text measure-wide">
          Dacă ai plătit deja sau ți se pare o greșeală, scrie-ne sau sună la
          <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
          >.
        </p>
        <button
          type="button"
          class="btn btn-primary invoice-action"
          :disabled="downloading === invoice.id"
          @click="download(invoice)"
        >
          <UIcon name="i-lucide-download" class="chip-icon" />
          {{ downloading === invoice.id ? "Se pregătește…" : "Descarcă factura (PDF)" }}
        </button>
      </div>

      <div
        v-for="invoice in pending"
        :key="invoice.id"
        class="portal-card portal-card-accent portal-notice"
      >
        <span class="portal-label">{{ statusLabel(invoice) }}</span>
        <div class="figure-line">
          <p class="portal-card-figure">{{ formatMonth(invoice.monthIssued) }}</p>
          <p class="portal-card-figure tnum">{{ formatLei(leftToPay(invoice)) }}</p>
        </div>
        <p v-if="invoice.paid" class="body-text">
          Ai plătit deja {{ formatLei(invoice.paid) }} din {{ formatLei(invoice.amount) }}; mai
          rămân {{ formatLei(leftToPay(invoice)) }}.
        </p>
        <p class="body-text">Emisă pe {{ formatDateKey(invoice.dateIssued) }}.</p>
        <p v-if="invoice.fiscalNumber" class="body-text measure-wide">
          Factura fiscală
          <span class="tnum">{{ invoice.fiscalSeries }} {{ invoice.fiscalNumber }}</span>
          — la transfer, trece-o în detaliile plății.
        </p>
        <button
          type="button"
          class="btn btn-primary invoice-action"
          :disabled="downloading === invoice.id"
          @click="download(invoice)"
        >
          <UIcon name="i-lucide-download" class="chip-icon" />
          {{ downloading === invoice.id ? "Se pregătește…" : "Descarcă factura (PDF)" }}
        </button>
      </div>

      <p v-if="overdue.length === 0 && pending.length === 0" class="portal-empty">
        Nu ai nicio factură neplătită.
      </p>

      <section class="portal-section">
        <h2 class="portal-label">Istoricul facturilor</h2>

        <p v-if="history.length === 0" class="portal-empty">
          Încă nu s-a emis nicio factură pentru familia ta.
        </p>

        <div v-else class="rows">
          <div v-for="invoice in history" :key="invoice.id" class="portal-row portal-row-baseline">
            <p class="portal-when month">{{ formatMonth(invoice.monthIssued) }}</p>

            <!-- A waived month is a row with nothing in it, not a missing row: "no invoice" and "an
                 invoice for nothing" are different facts, and only the second one is settled. -->
            <p class="amount tnum">
              {{ invoice.status === "waived" ? "Fără plată" : formatLei(invoice.amount) }}
            </p>

            <p class="status">{{ statusLabel(invoice) }}</p>

            <button
              v-if="invoice.status !== 'waived'"
              type="button"
              class="chip"
              :disabled="downloading === invoice.id"
              @click="download(invoice)"
            >
              <UIcon name="i-lucide-download" class="chip-icon" />
              PDF
            </button>
          </div>
        </div>
      </section>

      <!--
        E16/S5 and S6: what the school recorded as received, with the receipt SmartBill numbered for
        cash — the document the confirmation email points here for. A transfer has no document of
        its own: SmartBill records it on the invoice.
      -->
      <section v-if="received.length" class="portal-section">
        <h2 class="portal-label">Plățile înregistrate</h2>

        <div class="rows">
          <div v-for="payment in received" :key="payment.id" class="portal-row portal-row-baseline">
            <p class="portal-when month">{{ formatDateKey(payment.date) }}</p>
            <p class="amount tnum">{{ formatLei(payment.amount) }}</p>
            <p class="status">
              {{ PAYMENT_METHOD_LABELS[payment.method] }}
              <template v-if="payment.fiscalReceiptNumber">
                · chitanța
                <span class="tnum"
                  >{{ payment.fiscalReceiptSeries }} {{ payment.fiscalReceiptNumber }}</span
                >
              </template>
            </p>
          </div>
        </div>
      </section>

      <!--
        Terms §11.4: „Le vezi în portal". What each invoice already says about them, in one list, so
        a family can see a promised month before its invoice exists — the referral month the school
        granted in March for June, say. Newest month first, like the invoices above.
      -->
      <section v-if="discounts.length" class="portal-section">
        <h2 class="portal-label">Reducerile tale</h2>

        <div class="rows">
          <div
            v-for="discount in discounts"
            :key="discount.id"
            class="portal-row portal-row-baseline"
          >
            <p class="portal-when month">{{ formatMonth(discount.monthIssued) }}</p>
            <p class="amount tnum">{{ familyDiscountValue(discount.value, discount.type) }}</p>
            <p class="status">{{ discount.name }}</p>
          </div>
        </div>

        <p class="portal-empty">
          O reducere se scade din factura lunii ei. Procentul se socotește din prețul întreg al
          lunii.
        </p>
      </section>

      <!--
        Terms §11.3: by transfer or in cash. Where a transfer goes is the school's own setting
        (`SCHOOL_IBAN` and the beneficiary on the API); until it is set, the family is sent to the
        office rather than shown a made-up account.
      -->
      <section class="portal-section">
        <h2 class="portal-label">Cum se plătește</h2>
        <template v-if="transfer">
          <p class="body-text">Prin transfer bancar sau în numerar, la sediu. Pentru transfer:</p>
          <dl class="portal-dl transfer">
            <div class="portal-dl-row">
              <dt>Beneficiar</dt>
              <dd>{{ transfer.beneficiary }}</dd>
            </div>
            <div class="portal-dl-row">
              <dt>IBAN</dt>
              <dd class="tnum">{{ transfer.iban }}</dd>
            </div>
            <div v-if="transfer.bank" class="portal-dl-row">
              <dt>Bancă</dt>
              <dd>{{ transfer.bank }}</dd>
            </div>
          </dl>
          <p class="portal-empty">
            La detaliile plății scrie numărul facturii — cel fiscal, dacă factura îl are, așa cum
            apare mai sus. Plata cu cardul în portal nu există; dacă ai o întrebare despre o
            factură, sună-ne la <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
            >.
          </p>
        </template>
        <p v-else class="portal-empty">
          Prin transfer bancar sau în numerar, la sediu. Datele contului pentru transfer ți le dăm
          la birou sau la telefon; plata cu cardul în portal nu există — dacă ai o întrebare despre
          o factură, sună-ne la
          <a :href="SCHOOL_PHONE_HREF" class="link tnum">{{ SCHOOL_PHONE }}</a
          >.
        </p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { usePaymentsApi } from "~/composables/api/usePaymentsApi";
import { useDiscountsApi } from "~/composables/api/useDiscountsApi";
import { familyDiscountValue, type FamilyDiscount } from "~/types/discount.types";
import { PAYMENT_METHOD_LABELS, type Payment } from "~/types/payment.types";
import { usePDFApi } from "~/composables/api/usePDFApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatDateKey, formatLei, formatMonth } from "~/composables/useAdminFormat";
import {
  leftToPay,
  type Invoice,
  type InvoiceStatus,
  type PaymentDetails,
} from "~/types/invoice.types";
import { FIRST_CHILD_PER_SESSION, SIBLING_PER_SESSION } from "#shared/courses";
import { SCHOOL_PHONE, SCHOOL_PHONE_HREF } from "#shared/school";

/**
 * Plăți și facturi — E18/S4, screen 4.
 *
 * A family-level screen, deliberately: one invoice covers the household, so there is no child
 * switcher here and no question of whose screen this is.
 *
 * **The invoice is not broken down per child.** The design sketched a "Matei — 4 ședințe × 87,50"
 * line, and the API does not carry one: `Invoice` is a month, a total and a status, and the
 * per-child worksheet that would justify the line is admin-only and carries no amounts at all. The
 * rule is explained in the lede instead, which is the honest version — a breakdown assembled on this
 * side would be a second computation of a figure the server already decided, and the first month
 * they disagreed the parent would be reading a number nobody billed.
 *
 * There is likewise no due date: the fourteen-day term lives in `arrears.rules.ts` and is not on the
 * wire for a parent. `status` is what the API publishes, and it is what this screen shows.
 */
definePageMeta({
  title: "Plăți și facturi",
  layout: "portal" as any,
});

const invoiceApi = useInvoiceApi();
const paymentsApi = usePaymentsApi();
const discountsApi = useDiscountsApi();
const { fetchInvoicePdf } = usePDFApi();
const notifications = useNotifications();

const loading = ref(true);
const loadError = ref("");
const invoices = ref<Invoice[]>([]);
const payments = ref<Payment[]>([]);
const discounts = ref<FamilyDiscount[]>([]);
const transfer = ref<PaymentDetails["transfer"]>(null);
const downloading = ref<number | null>(null);

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  pending: "Neplătită",
  paid: "Plătită",
  overdue: "Restantă",
  waived: "Fără plată",
};

/** A pending invoice with money already on it is partly paid, not unpaid — the family sent something. */
const statusLabel = (invoice: Invoice): string =>
  invoice.status === "pending" && invoice.paid ? "Plătită parțial" : STATUS_LABELS[invoice.status];

const byMonthDesc = (a: Invoice, b: Invoice) => b.monthIssued.localeCompare(a.monthIssued);

const overdue = computed(() =>
  invoices.value.filter((invoice) => invoice.status === "overdue").sort(byMonthDesc)
);

const pending = computed(() =>
  invoices.value.filter((invoice) => invoice.status === "pending").sort(byMonthDesc)
);

/** Everything, newest first — the unpaid ones included, so the ledger is complete. */
const history = computed(() => [...invoices.value].sort(byMonthDesc));

/** Money the school counts as received, newest first. An announced or reversed sum is not. */
const received = computed(() =>
  payments.value
    .filter((payment) => payment.status === "succeeded")
    .sort((a, b) => b.date.localeCompare(a.date))
);

/**
 * What the page shows, read again by the retry under an error (QA of 27 September 2026: only
 * Profil offered one, so a portal page that failed on a bad connection stayed failed until a reload).
 */
const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    await invoiceApi.fetchInvoices();
    invoices.value = invoiceApi.getInvoices();
    // The payments are a second list under the invoices; one that cannot be read leaves the
    // invoices on the screen rather than taking them with it.
    // Likewise the discounts and the transfer details: furniture around the invoices, each with
    // an honest empty state of its own.
    const [paid, promised, details] = await Promise.all([
      paymentsApi.fetchPayments().catch(() => []),
      discountsApi.fetchFamilyDiscounts().catch(() => []),
      invoiceApi.fetchPaymentDetails().catch(() => ({ transfer: null })),
    ]);
    payments.value = paid;
    discounts.value = promised;
    transfer.value = details.transfer;
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca facturile.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

/**
 * The PDF, through the API rather than from a link.
 *
 * The endpoint needs the bearer token, which a plain `<a>` does not carry, and it goes through
 * `useApi` so an expired access token is refreshed rather than turning into a silent nothing.
 */
const download = async (invoice: Invoice) => {
  downloading.value = invoice.id;
  try {
    const blob = await fetchInvoicePdf(invoice.id);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `factura-${invoice.monthIssued}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    notifications.error("Nu am putut descărca factura", apiErrorMessage(err));
  } finally {
    downloading.value = null;
  }
};
</script>

<style scoped>
.figure-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2) var(--space-6);
}

.invoice-action {
  align-self: flex-start;
  min-height: 44px;
  margin-top: var(--space-2);
}

.rows {
  display: flex;
  flex-direction: column;
  margin-top: var(--space-2);
}

.month {
  min-width: 150px;
  margin: 0;
}

.amount {
  font-family: var(--font-heading);
  font-weight: 400;
  font-size: 20px;
  line-height: 24px;
  margin: 0;
  flex: 1;
  min-width: 120px;
}

.status {
  font-size: 14px;
  line-height: 24px;
  margin: 0;
  color: var(--color-accent-ink);
}

.transfer {
  margin-block: var(--space-2) var(--space-3);
}

.chip-icon {
  width: 14px;
  height: 14px;
  color: var(--color-accent-ink);
}
</style>
