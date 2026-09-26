<template>
  <div class="w-full max-w-4xl mx-auto px-4 py-6 pb-32 space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Emitere facturi</h1>
        <p class="text-muted mt-1">
          Ședințele fiecărui copil sunt <strong>numărate din cataloage</strong>. Aici le verifici:
          desfă un copil ca să vezi ce zile intră și de ce, iar ce n-are catalog stă deasupra,
          fiindcă aia sunt banii care nu se cer. Dacă numărul nu e cel bun, îl corectezi aici, pe
          copil — corectura rămâne consemnată, cu cine și de ce.
        </p>
      </div>
      <UFormField label="Luna">
        <UInput v-model="monthIssued" type="month" class="w-44" @change="load()" />
      </UFormField>
    </div>

    <UCard v-if="loadError" class="border border-error" variant="subtle">
      <p class="font-medium">{{ loadError }}</p>
    </UCard>

    <div v-else-if="loading" class="py-12 text-center text-muted">Se încarcă…</div>

    <template v-else-if="worksheet">
      <p class="text-sm text-muted">
        Luna de predare
        <strong>{{ formatDateKey(worksheet.from) }} – {{ formatDateKey(worksheet.to) }}</strong>
        — săptămânile a căror luni cade în {{ monthLabel }}.
      </p>

      <!--
        E15 S9: a month is issued once taught. The button stayed live on the month in progress, and
        one press recorded every family's month as 0 lei, frozen for good (QA of 26 September 2026).
        The server refuses it too; this says why before anybody presses.
      -->
      <UAlert
        v-if="!worksheet.issuable"
        color="info"
        variant="subtle"
        icon="i-lucide-calendar-clock"
        title="Luna nu s-a terminat încă"
        :description="`Ultima ei săptămână de cursuri se încheie pe ${formatDateKey(worksheet.to)}. Facturile se emit după aceea, din cataloagele complete.`"
      />

      <!--
        First, and loud: a session with no register is not a gap in the paperwork, it is an hour
        nobody is being billed for — 87,50 lei of every child in the group. The fix is the register,
        which can still be taken, or a cancellation, which is the explicit way to say the hour did
        not happen. The per-child correction below is for the number, not for the register.
      -->
      <UCard v-if="worksheet.unmarked.length > 0" class="border border-warning" variant="subtle">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-triangle-alert" class="text-warning text-xl shrink-0 mt-0.5" />
          <div class="space-y-2 min-w-0">
            <p class="font-semibold">
              {{ worksheet.unmarked.length }}
              {{
                worksheet.unmarked.length === 1 ? "ședință fără catalog" : "ședințe fără catalog"
              }}
              — nu se facturează nimănui
            </p>
            <ul class="text-sm space-y-1">
              <li v-for="row in worksheet.unmarked" :key="row.sessionId" class="tabular-nums">
                {{ row.groupName }} · {{ formatDateKey(row.date) }} ·
                {{ row.startTime.slice(0, 5) }}
              </li>
            </ul>
            <p class="text-sm text-muted">
              Ori se completează catalogul din
              <NuxtLink to="/admin/orar" class="underline">orar</NuxtLink>, ori se anulează ora.
              Emiterea nu așteaptă, dar factura va fi cu o ședință mai mică.
            </p>
          </div>
        </div>
      </UCard>

      <UCard v-if="worksheet.families.length === 0" class="border" variant="subtle">
        <div class="py-8 text-center space-y-2">
          <UIcon name="i-lucide-inbox" class="text-3xl text-muted" />
          <p class="font-medium">Nicio familie de facturat.</p>
          <p class="text-muted text-sm">
            Aici apar familiile cu un copil înscris — nu la probă — în vreo zi a lunii.
          </p>
        </div>
      </UCard>

      <template v-else>
        <!--
          A tree, not a table: the invoice is per family and the sessions are per child, so the two
          levels have to be visible at once. Flattening it would hide which children share a bill,
          which is exactly what the sibling rate depends on.
        -->
        <template v-for="family in families" :key="family.parentId">
          <h2
            v-if="groupHeadingFor(family)"
            class="text-sm font-semibold text-muted uppercase tracking-wide pt-2"
          >
            {{ groupHeadingFor(family) }}
          </h2>

          <UCard class="border">
            <!-- Wraps at phone width: the amounts block used to be clipped by the card (QA of
                 26 September 2026, 390 px). -->
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-3">
              <div class="min-w-0">
                <p class="font-semibold text-lg">{{ family.parentName }}</p>
                <p v-if="family.email" class="text-sm text-muted">{{ family.email }}</p>
              </div>
              <div class="text-right shrink-0">
                <template v-if="family.alreadyInvoiced">
                  <UBadge color="neutral" variant="subtle">Deja facturat</UBadge>
                  <p
                    v-if="family.invoicedAmount !== null"
                    class="font-bold text-lg tabular-nums mt-1"
                  >
                    {{ formatLei(family.invoicedAmount) }}
                  </p>
                  <!-- A register marked after the month was issued: the invoice keeps its sum, and
                       the office should see that the registers now say otherwise. -->
                  <p
                    v-if="family.invoicedAmount !== null && family.invoicedAmount !== family.amount"
                    class="text-xs text-muted mt-1 max-w-48"
                  >
                    Cataloagele de acum ar da {{ formatLei(family.amount) }}.
                  </p>
                </template>
                <template v-else-if="family.amount === 0">
                  <UBadge color="info" variant="subtle">Fără plată</UBadge>
                  <p class="text-xs text-muted mt-1">se consemnează, fără factură</p>
                </template>
                <template v-else>
                  <p class="font-bold text-lg tabular-nums">{{ formatLei(family.amount) }}</p>
                  <p
                    v-if="family.discounts.length > 0"
                    class="text-xs text-muted tabular-nums mt-1"
                  >
                    din {{ formatLei(family.listAmount) }}, după reduceri
                  </p>
                </template>
              </div>
            </div>

            <div class="space-y-2 pl-4 border-l-2 border-muted">
              <div v-for="child in family.children" :key="child.childId">
                <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div class="flex-1 min-w-0">
                    <p class="truncate">{{ child.childName }}</p>
                    <p class="text-sm text-muted truncate">
                      {{ child.groupName }}
                      <template v-if="child.weekday"> · {{ weekdayLabel(child.weekday) }}</template>
                    </p>
                  </div>

                  <!-- The count, read from the registers. The button unfolds the sessions behind it. -->
                  <UButton
                    variant="ghost"
                    color="neutral"
                    size="sm"
                    class="tabular-nums"
                    :icon="
                      isOpen(child.childId) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
                    "
                    :disabled="child.lines.length === 0"
                    @click="toggle(child.childId)"
                  >
                    {{ child.counted }} în catalog
                  </UButton>

                  <!--
                    The one number that still enters by hand. Prefilled with what will be billed;
                    typing something else records a correction for this child and month, typing
                    the count back clears it. Saved on blur or Enter, then the sheet reloads so the
                    family total is the server's, not this screen's arithmetic.
                  -->
                  <div class="flex items-center gap-2 shrink-0">
                    <UInput
                      type="number"
                      min="0"
                      step="1"
                      class="w-20"
                      :model-value="String(draftFor(child))"
                      :disabled="family.alreadyInvoiced || saving.has(child.childId)"
                      :color="child.override ? 'warning' : undefined"
                      :aria-label="`Ședințe facturate pentru ${child.childName}`"
                      @update:model-value="(value) => (drafts[child.childId] = value)"
                      @blur="commit(family, child)"
                      @keydown.enter.prevent="commit(family, child)"
                    />
                    <span class="text-sm text-muted">{{
                      child.sessions === 1 ? "ședință" : "ședințe"
                    }}</span>
                  </div>

                  <p
                    class="text-sm w-44 shrink-0 tabular-nums"
                    :class="child.sessions === 0 ? 'text-warning' : 'text-muted'"
                  >
                    <template v-if="family.alreadyInvoiced">—</template>
                    <template v-else-if="child.sessions === 0">nu se taxează</template>
                    <template v-else>
                      × {{ formatLei(rateFor(family, child.childId)) }} =
                      {{ formatLei(lineTotal(family, child.childId)) }}
                    </template>
                  </p>
                </div>

                <!-- A correction on file says so, and carries its reason — editable until issued. -->
                <div
                  v-if="child.override"
                  class="mt-1 flex flex-col sm:flex-row sm:items-center gap-2 text-sm"
                >
                  <UBadge color="warning" variant="subtle" size="sm" class="shrink-0">
                    corectat din {{ child.counted }}
                  </UBadge>
                  <UInput
                    class="flex-1"
                    size="sm"
                    placeholder="motiv (opțional)"
                    maxlength="500"
                    :model-value="reasonFor(child)"
                    :disabled="family.alreadyInvoiced || saving.has(child.childId)"
                    @update:model-value="(value) => (reasons[child.childId] = String(value))"
                    @blur="commitReason(child)"
                    @keydown.enter.prevent="commitReason(child)"
                  />
                </div>

                <!--
                  The unfolding: each held session of the child's group, with the reason it did or
                  did not count. A vacation session the child skipped shows as not counted — that is
                  the one case where presence changes the money, and it should be visible here.
                -->
                <ul
                  v-if="isOpen(child.childId)"
                  class="mt-2 ml-2 text-sm space-y-1 border-l pl-3 border-muted"
                >
                  <li
                    v-for="line in child.lines"
                    :key="line.sessionId"
                    class="flex items-center gap-2 tabular-nums"
                    :class="line.counted ? '' : 'text-muted line-through'"
                  >
                    <span>{{ formatDateKey(line.date) }}</span>
                    <UBadge v-if="line.isVacation" color="warning" variant="subtle" size="sm">
                      vacanță
                    </UBadge>
                    <span class="text-muted">
                      <template v-if="line.present === true">prezent</template>
                      <template v-else-if="line.present === false">absent</template>
                      <template v-else>nemarcat</template>
                      <template v-if="line.isVacation && !line.counted"> — nu se taxează</template>
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <!--
              The month's discounts, each with what it takes off. The lines above add up to the
              price before them and the total at the top is after them; without these lines the
              difference was nowhere, which is how a right bill gets "fixed" by hand (QA of
              26 September 2026, and the warning in E20/S5).
            -->
            <ul
              v-if="!family.alreadyInvoiced && family.discounts.length > 0"
              class="mt-3 pl-4 text-sm space-y-1 tabular-nums"
            >
              <li
                v-for="discount in family.discounts"
                :key="discount.id"
                class="flex flex-wrap justify-between gap-x-4"
              >
                <span>
                  Reducere „{{ discount.name }}”<template v-if="discount.type === 'percent'">
                    ({{ discount.value }}%)</template
                  >
                </span>
                <span>−{{ formatLei(discount.off) }}</span>
              </li>
              <li v-if="family.amount === 0 && family.listAmount > 0" class="text-muted">
                Reducerile acoperă tot prețul lunii, deci luna iese fără plată.
              </li>
            </ul>
          </UCard>
        </template>
      </template>
    </template>

    <!-- Pinned, because the total is the thing that catches a wrong month: one bad group is
         invisible in a list, a total 300 lei off is not. -->
    <div
      v-if="worksheet && worksheet.families.length > 0"
      class="fixed bottom-0 left-0 right-0 border-t bg-default/95 backdrop-blur z-20"
    >
      <div class="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex-1">
          <p class="text-2xl font-bold tabular-nums">{{ formatLei(grandTotal) }}</p>
          <p class="text-sm text-muted">
            {{ billableCount }} {{ billableCount === 1 ? "factură" : "facturi" }}
            <template v-if="waivedCount > 0"> · {{ waivedCount }} fără plată</template>
            <template v-if="skippedCount > 0"> · {{ skippedCount }} deja facturate</template>
            <template v-if="worksheet.unmarked.length > 0">
              · <span class="text-warning">{{ worksheet.unmarked.length }} fără catalog</span>
            </template>
          </p>
        </div>
        <UButton
          size="lg"
          color="primary"
          :disabled="!canIssue || sending"
          :loading="sending"
          @click="send"
        >
          <template v-if="billableCount === 0">Consemnează luna</template>
          <template v-else
            >Emite {{ billableCount }} {{ billableCount === 1 ? "factură" : "facturi" }}</template
          >
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { countOf } from "~/composables/useRomanianCount";
import { computed, onMounted, reactive, ref } from "vue";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatDateKey, formatLei } from "~/composables/useAdminFormat";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { getWeekdayName } from "~/composables/useUtils";
import { orderByGroup, primaryGroupOf } from "~/composables/useInvoiceWorksheetOrder";
import type { InvoiceWorksheet, InvoiceWorksheetRow } from "~/types/invoice.types";

/**
 * Where a month's invoices are issued — E15/S9.
 *
 * The school has always charged per session held. S0 put that arithmetic on a screen: somebody
 * typed the count per child and the server multiplied. S9 took the typing away too. The count is
 * read from the month's registers — a session with no register never happened and bills nobody, a
 * held one bills the whole group, a vacation one bills only who came — and this screen shows it,
 * lets it be unfolded, and puts the sessions with no register above everything else.
 *
 * "No manual invoicing" does not mean "no eyes". It means the eyes look at what happened, not at
 * what somebody typed — and when what happened is not what should be billed, the person says so
 * here, per child, as a recorded correction: what the registers say stays visible next to it, and
 * the server keeps who decided, when and why. The invoice carries a single product line, so the
 * correction changes the amount without the document ever contradicting the registers.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Emitere facturi",
});

/** 87,50 lei for the first child, 62,50 for each sibling. Mirrors `pricing.ts`, for the per-line hint only. */
const FIRST_CHILD_PER_SESSION = 87.5;
const SIBLING_PER_SESSION = 62.5;

const MONTHS = [
  "ianuarie",
  "februarie",
  "martie",
  "aprilie",
  "mai",
  "iunie",
  "iulie",
  "august",
  "septembrie",
  "octombrie",
  "noiembrie",
  "decembrie",
];

const { fetchWorksheet, issueInvoices, setSessionCountOverride, clearSessionCountOverride } =
  useInvoiceApi();
const { success, error: notifyError } = useNotifications();

type WorksheetChild = InvoiceWorksheetRow["children"][number];

const worksheet = ref<InvoiceWorksheet | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const sending = ref(false);
/**
 * The month before this one, from the local calendar — the month in progress is never issuable
 * (E15 S9), and `toISOString()` gave the UTC month, the previous one on the 1st before 03:00.
 */
const previousMonth = (now: Date = new Date()): string => {
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`;
};
const monthIssued = ref(previousMonth());

/** By group, not alphabetically — see `useInvoiceWorksheetOrder` for why. */
const families = computed(() => orderByGroup(worksheet.value?.families ?? []));

const monthLabel = computed(() => {
  const [year, month] = monthIssued.value.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
});

/** The heading, shown only on the first family of each group's run. */
const groupHeadingFor = (family: InvoiceWorksheetRow): string | null => {
  const index = families.value.indexOf(family);
  const own = primaryGroupOf(family);
  const previous = index > 0 ? primaryGroupOf(families.value[index - 1]!) : null;

  const key = (group: ReturnType<typeof primaryGroupOf>) => (group ? `${group.groupId}` : "none");
  if (index > 0 && key(own) === key(previous)) return null;

  if (!own) return "Fără grupă";
  return own.weekday
    ? `${own.groupName} · ${weekdayLabel(own.weekday)}`
    : (own.groupName ?? "Fără grupă");
};

const weekdayLabel = (weekday: number) => getWeekdayName(weekday);

/** Which children are unfolded to their sessions. */
const open = ref(new Set<number>());
const isOpen = (childId: number) => open.value.has(childId);
const toggle = (childId: number) => {
  const next = new Set(open.value);
  if (next.has(childId)) next.delete(childId);
  else next.add(childId);
  open.value = next;
};

/**
 * The per-line hint mirrors the server's rule: the full rate goes to the child with the most
 * sessions, the sibling rate to the rest. The family total shown is the server's own `amount`,
 * which also carries the month's discounts — this hint is per line and does not.
 */
const rateFor = (family: InvoiceWorksheetRow, childId: number) => {
  const ranked = [...family.children]
    .filter((child) => child.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
  const index = ranked.findIndex((child) => child.childId === childId);
  if (index === -1) return FIRST_CHILD_PER_SESSION;
  return index === 0 ? FIRST_CHILD_PER_SESSION : SIBLING_PER_SESSION;
};

const lineTotal = (family: InvoiceWorksheetRow, childId: number) => {
  const child = family.children.find((row) => row.childId === childId);
  if (!child) return 0;
  return Math.round(child.sessions * rateFor(family, childId) * 100) / 100;
};

/**
 * What is being typed, per child, until it is committed. Keyed by child because the sheet reloads
 * after every save and the rows are rebuilt; an entry exists only while the field has been touched.
 */
const drafts = reactive<Record<number, string | number>>({});
const reasons = reactive<Record<number, string>>({});
const saving = ref(new Set<number>());

const draftFor = (child: WorksheetChild) => drafts[child.childId] ?? child.sessions;
const reasonFor = (child: WorksheetChild) => reasons[child.childId] ?? child.override?.reason ?? "";

const withSaving = async (childId: number, work: () => Promise<void>) => {
  saving.value = new Set(saving.value).add(childId);
  try {
    await work();
    // Reloaded, not patched: the family total and the sibling rate are the server's business.
    await load({ keepOpen: true });
  } catch (err) {
    notifyError("Nu am putut salva corectura", apiErrorMessage(err));
  } finally {
    const next = new Set(saving.value);
    next.delete(childId);
    saving.value = next;
  }
};

/**
 * Commits the typed number. Equal to the count means "no correction" — an existing one is cleared
 * rather than stored as a correction that changes nothing. Equal to what is already billed means
 * nothing to do.
 */
const commit = async (family: InvoiceWorksheetRow, child: WorksheetChild) => {
  const raw = drafts[child.childId];
  if (raw === undefined || family.alreadyInvoiced) return;
  delete drafts[child.childId];

  const value = raw === "" ? NaN : Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    notifyError("Numărul de ședințe trebuie să fie un întreg, zero sau mai mare.");
    return;
  }
  if (value === child.sessions) return;

  await withSaving(child.childId, async () => {
    if (value === child.counted) {
      await clearSessionCountOverride(monthIssued.value, child.childId);
    } else {
      const reason = reasonFor(child).trim();
      await setSessionCountOverride({
        monthIssued: monthIssued.value,
        childId: child.childId,
        sessions: value,
        reason: reason || undefined,
      });
    }
  });
};

/** The reason on its own: the number stays, the words change. Only ever on a correction on file. */
const commitReason = async (child: WorksheetChild) => {
  const typed = reasons[child.childId];
  if (typed === undefined || !child.override) return;
  delete reasons[child.childId];

  const reason = typed.trim();
  if (reason === (child.override.reason ?? "")) return;

  await withSaving(child.childId, async () => {
    await setSessionCountOverride({
      monthIssued: monthIssued.value,
      childId: child.childId,
      sessions: child.override!.sessions,
      reason: reason || undefined,
    });
  });
};

const billable = computed(() => families.value.filter((family) => !family.alreadyInvoiced));

const grandTotal = computed(
  () => Math.round(billable.value.reduce((sum, family) => sum + family.amount, 0) * 100) / 100
);

/** Families who will receive an actual invoice, with a sum on it. */
const billableCount = computed(() => billable.value.filter((family) => family.amount > 0).length);

/**
 * Families whose month comes to nothing. They still get a row, marked as waived, and no document.
 * Counted separately on the button: "12 facturi" alongside "3 fără plată" says the month is fully
 * handled, where a bare "12" would leave three families looking forgotten.
 */
const waivedCount = computed(() => billable.value.filter((family) => family.amount === 0).length);

const skippedCount = computed(
  () => families.value.filter((family) => family.alreadyInvoiced).length
);

/**
 * `keepOpen` for the reload after a correction: the person is looking at one child's sessions and
 * should not find them folded away because a number was saved.
 */
const load = async ({ keepOpen = false } = {}) => {
  loadError.value = null;
  if (!keepOpen) {
    loading.value = true;
    open.value = new Set();
  }
  // A cleared month field sent `monthIssued=` and printed the validator's English in the error card
  // (QA of 26 September 2026). There is nothing to ask the server about a month nobody picked.
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthIssued.value)) {
    worksheet.value = null;
    loadError.value = "Alege luna de facturat.";
    loading.value = false;
    return;
  }
  try {
    worksheet.value = await fetchWorksheet(monthIssued.value);
  } catch (err) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca fișa lunii.");
  } finally {
    loading.value = false;
  }
};

/**
 * Only the month on screen, once taught, with something to record. A cleared or retyped month
 * left the previous month's worksheet — and its live button — behind.
 */
const canIssue = computed(
  () =>
    !!worksheet.value &&
    worksheet.value.month === monthIssued.value &&
    worksheet.value.issuable &&
    billableCount.value + waivedCount.value > 0
);

const send = async () => {
  if (!canIssue.value) return;
  sending.value = true;
  try {
    // The day the office presses: it is when the family learns what it owes, and the fourteen days
    // run from it (E16 S7). The first of the next month, printed before, made a month issued late
    // overdue on arrival and one issued early dated in the future (QA of 26 September 2026).
    const result = await issueInvoices({ monthIssued: monthIssued.value, dateIssued: todayKey() });

    const issued = result?.issued?.length ?? 0;
    const waived = result?.waived?.length ?? 0;
    // E16/S2: the fiscal documents are made afterwards, off this request. Said here, so "emise"
    // is not read as "already in SmartBill" — the month's page shows each one's state.
    const queued =
      result?.issued?.filter((invoice) => invoice.fiscalStatus === "pending").length ?? 0;
    const skipped = result?.skipped?.length ?? 0;
    // What this press issued, summed from what came back — not the sheet's total. Two admins
    // pressing together left the second one reading "0 facturi emise · 600 lei" (QA of 26
    // September 2026): the sum of invoices somebody else had just issued.
    if (issued === 0 && waived === 0 && skipped > 0) {
      success(
        "Luna era deja emisă",
        "Altcineva a emis-o înaintea ta — fișa de mai jos arată ce s-a emis."
      );
    } else {
      const total = (result?.issued ?? []).reduce((sum, invoice) => sum + invoice.amount, 0);
      const details = [formatLei(total)];
      if (waived > 0)
        details.push(countOf(waived, "lună consemnată", "luni consemnate") + " fără plată");
      if (queued > 0) details.push(`${queued} pleacă în SmartBill în minutele următoare`);
      success(countOf(issued, "factură emisă", "facturi emise"), details.join(" · "));
    }
    // Reloaded rather than adjusted by hand: everything just issued comes back marked, which is
    // also what makes a second pass safe after a family enrols mid-month.
    await load();
  } catch (err) {
    notifyError("Nu am putut emite facturile", apiErrorMessage(err));
  } finally {
    sending.value = false;
  }
};

onMounted(() => load());
</script>
