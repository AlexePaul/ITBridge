<template>
  <div class="w-full max-w-4xl mx-auto px-4 py-6 pb-32 space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Emitere facturi</h1>
        <p class="text-muted mt-1">
          Ședințele fiecărui copil sunt <strong>numărate din cataloage</strong>, nu tastate. Aici le
          verifici: desfă un copil ca să vezi ce zile intră și de ce, iar ce n-are catalog stă
          deasupra, fiindcă aia sunt banii care nu se cer.
        </p>
      </div>
      <UFormField label="Luna">
        <UInput v-model="monthIssued" type="month" class="w-44" @change="load" />
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
        First, and loud: a session with no register is not a gap in the paperwork, it is an hour
        nobody is being billed for — 87,50 lei of every child in the group. There is no override
        field on this screen on purpose (E15/S9): the fix is the register, which can still be taken,
        or a cancellation, which is the explicit way to say the hour did not happen.
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
            <div class="flex items-start justify-between gap-4 mb-3">
              <div>
                <p class="font-semibold text-lg">{{ family.parentName }}</p>
                <p v-if="family.email" class="text-sm text-muted">{{ family.email }}</p>
              </div>
              <div class="text-right shrink-0">
                <UBadge v-if="family.alreadyInvoiced" color="neutral" variant="subtle">
                  Deja facturat
                </UBadge>
                <template v-else-if="family.amount === 0">
                  <UBadge color="info" variant="subtle">Fără plată</UBadge>
                  <p class="text-xs text-muted mt-1">se consemnează, fără factură</p>
                </template>
                <p v-else class="font-bold text-lg tabular-nums">{{ formatLei(family.amount) }}</p>
              </div>
            </div>

            <div class="space-y-2 pl-4 border-l-2 border-gray-200">
              <div v-for="child in family.children" :key="child.childId">
                <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div class="flex-1 min-w-0">
                    <p class="truncate">{{ child.childName }}</p>
                    <p class="text-sm text-muted truncate">
                      {{ child.groupName }}
                      <template v-if="child.weekday"> · {{ weekdayLabel(child.weekday) }}</template>
                    </p>
                  </div>

                  <!-- Read, not typed. The button unfolds the sessions behind the number. -->
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
                    {{ child.sessions }} {{ child.sessions === 1 ? "ședință" : "ședințe" }}
                  </UButton>

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

                <!--
                  The unfolding: each held session of the child's group, with the reason it did or
                  did not count. A vacation session the child skipped shows as not counted — that is
                  the one case where presence changes the money, and it should be visible here.
                -->
                <ul
                  v-if="isOpen(child.childId)"
                  class="mt-2 ml-2 text-sm space-y-1 border-l pl-3 border-gray-200"
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
          :disabled="billableCount + waivedCount === 0 || sending"
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
import { computed, onMounted, ref } from "vue";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatDateKey } from "~/composables/useAdminFormat";
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
 * what somebody typed. There is no override field, on purpose: a wrong number is a wrong register,
 * and the register can still be taken — or the hour cancelled, which is the explicit way to say it
 * did not happen.
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

const { fetchWorksheet, issueInvoices } = useInvoiceApi();
const { success, error: notifyError } = useNotifications();

const worksheet = ref<InvoiceWorksheet | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const sending = ref(false);
const monthIssued = ref(new Date().toISOString().slice(0, 7));

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
const formatLei = (value: number) =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(value);

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

const load = async () => {
  loading.value = true;
  loadError.value = null;
  open.value = new Set();
  try {
    worksheet.value = await fetchWorksheet(monthIssued.value);
  } catch (err) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca fișa lunii.");
  } finally {
    loading.value = false;
  }
};

const send = async () => {
  sending.value = true;
  try {
    // The date printed is the first of the month after the teaching month, which is when this
    // screen can first be used: the last session's register has to exist before the count is right.
    const [year, month] = monthIssued.value.split("-").map(Number);
    const next = new Date(year!, month!, 1);
    const dateIssued = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

    const result = await issueInvoices({ monthIssued: monthIssued.value, dateIssued });

    const issued = result?.issued?.length ?? 0;
    const waived = result?.waived?.length ?? 0;
    success(
      `${issued} ${issued === 1 ? "factură emisă" : "facturi emise"}`,
      waived > 0
        ? `${formatLei(grandTotal.value)} · ${waived} luni consemnate fără plată`
        : formatLei(grandTotal.value)
    );
    // Reloaded rather than adjusted by hand: everything just issued comes back marked, which is
    // also what makes a second pass safe after a family enrols mid-month.
    await load();
  } catch (err) {
    notifyError("Nu am putut emite facturile", apiErrorMessage(err));
  } finally {
    sending.value = false;
  }
};

onMounted(load);
</script>
