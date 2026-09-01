<template>
  <div class="w-full max-w-4xl mx-auto px-4 py-6 pb-32 space-y-6">
    <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">Emitere facturi</h1>
        <p class="text-muted mt-1">
          Câte ședințe a avut fiecare copil în luna asta. Suma se calculează singură. Scrie
          <strong>0</strong> pentru un copil care nu a venit sau pe care nu îl taxăm — se
          consemnează, fără să plece vreo factură.
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

    <UCard v-else-if="families.length === 0" class="border" variant="subtle">
      <div class="py-8 text-center space-y-2">
        <UIcon name="i-lucide-inbox" class="text-3xl text-muted" />
        <p class="font-medium">Nicio familie de facturat.</p>
        <p class="text-muted text-sm">
          Aici apar familiile care au cel puțin un copil într-o grupă.
        </p>
      </div>
    </UCard>

    <template v-else>
      <!--
        A tree, not a table: the invoice is per family and the hours are per child, so the two
        levels have to be visible at once. Flattening it to one row per child would hide which
        children share a bill, which is exactly what the sibling rate depends on.
      -->
      <template v-for="family in families" :key="family.parentId">
        <!-- Where one group's run begins. The counting is done per group — somebody opens the
             Monday timetable, sees March had four sessions, and types 4 down the column — so the
             screen shows where that column starts and ends. -->
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
              <template
                v-else-if="(totals.get(family.parentId) ?? 0) === 0 && familyComplete(family)"
              >
                <UBadge color="info" variant="subtle">Fără plată</UBadge>
                <p class="text-xs text-muted mt-1">se consemnează, fără factură</p>
              </template>
              <p v-else class="font-bold text-lg tabular-nums">
                {{ formatLei(totals.get(family.parentId) ?? 0) }}
              </p>
            </div>
          </div>

          <div class="space-y-2 pl-4 border-l-2 border-gray-200">
            <div
              v-for="child in family.children"
              :key="child.childId"
              class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
            >
              <div class="flex-1 min-w-0">
                <p class="truncate">{{ child.childName }}</p>
                <p class="text-sm text-muted truncate">
                  {{ child.groupName }}
                  <template v-if="child.weekday"> · {{ weekdayLabel(child.weekday) }}</template>
                </p>
              </div>

              <UInput
                v-model="sessions[child.childId]"
                type="number"
                min="0"
                inputmode="numeric"
                :disabled="family.alreadyInvoiced"
                :color="isBlank(child.childId) ? 'error' : undefined"
                placeholder="ore"
                class="w-24"
                @focus="selectAll"
              />

              <p
                class="text-sm w-44 shrink-0 tabular-nums"
                :class="isBlank(child.childId) ? 'text-warning' : 'text-muted'"
              >
                <template v-if="family.alreadyInvoiced">—</template>
                <template v-else-if="isBlank(child.childId)">completează</template>
                <!-- Zero is a real answer, not a blank one: the child did not come, or the school
                   chose not to charge. It is recorded either way. -->
                <template v-else-if="countOf(child.childId) === 0">nu se taxează</template>
                <template v-else>
                  × {{ formatLei(rateFor(family.parentId, child.childId)) }} =
                  {{ formatLei(lineTotal(family.parentId, child.childId)) }}
                </template>
              </p>
            </div>
          </div>
        </UCard>
      </template>
    </template>

    <!-- Pinned, because the total is the thing that catches a wrong number: one bad group is
         invisible in a list, a total 300 lei off is not. -->
    <div
      v-if="families.length > 0"
      class="fixed bottom-0 left-0 right-0 border-t bg-default/95 backdrop-blur z-20"
    >
      <div class="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div class="flex-1">
          <p class="text-2xl font-bold tabular-nums">{{ formatLei(grandTotal) }}</p>
          <p class="text-sm text-muted">
            {{ billableCount }} {{ billableCount === 1 ? "factură" : "facturi" }}
            <template v-if="waivedCount > 0"> · {{ waivedCount }} fără plată</template>
            <template v-if="skippedCount > 0"> · {{ skippedCount }} deja facturate</template>
          </p>
        </div>
        <UButton
          size="lg"
          color="primary"
          :disabled="blankCount > 0 || billableCount + waivedCount === 0 || sending"
          :loading="sending"
          @click="send"
        >
          <template v-if="blankCount > 0">
            {{ blankCount }} {{ blankCount === 1 ? "câmp necompletat" : "câmpuri necompletate" }}
          </template>
          <template v-else-if="billableCount === 0">Consemnează luna</template>
          <template v-else
            >Emite {{ billableCount }} {{ billableCount === 1 ? "factură" : "facturi" }}</template
          >
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useInvoiceApi } from "~/composables/api/useInvoiceApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { getWeekdayName } from "~/composables/useUtils";
import { orderByGroup, primaryGroupOf } from "~/composables/useInvoiceWorksheetOrder";
import type { InvoiceWorksheetRow } from "~/types/invoice.types";

/**
 * Where a month's invoices are issued — E15, the model actually in force.
 *
 * The school has always charged per session held, not per month: a February with two classes is not
 * a March with five. That arithmetic was done by hand with a calculator every month. Here the
 * counts are typed once, per child, and everything downstream follows.
 *
 * Nothing is pre-filled. The timetable could supply a suggestion, and one day may, but the person
 * pressing the button is the one who knows whether a class actually happened — and a number they
 * typed is a number they have looked at.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Emitere facturi",
});

/** 87,50 lei for the first child, 62,50 for each sibling. Mirrors `pricing.ts`. */
const FIRST_CHILD_PER_SESSION = 87.5;
const SIBLING_PER_SESSION = 62.5;

const { fetchWorksheet, issueInvoices } = useInvoiceApi();
const { success, error: notifyError } = useNotifications();

const rawFamilies = ref<InvoiceWorksheetRow[]>([]);

/** By group, not alphabetically — see `useInvoiceWorksheetOrder` for why. */
const families = computed(() => orderByGroup(rawFamilies.value));

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
const loading = ref(true);
const loadError = ref<string | null>(null);
const sending = ref(false);

/** Keyed by child id. A string, because an empty input is "" and that is not the same as 0. */
const sessions = reactive<Record<number, string>>({});

const monthIssued = ref(new Date().toISOString().slice(0, 7));

const weekdayLabel = (weekday: number) => getWeekdayName(weekday);
const formatLei = (value: number) =>
  new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    maximumFractionDigits: 2,
  }).format(value);

/** Selecting on focus means tabbing through and typing over is one keystroke, not three. */
const selectAll = (event: FocusEvent) => (event.target as HTMLInputElement)?.select();

const billable = computed(() => families.value.filter((family) => !family.alreadyInvoiced));

/**
 * Blank is not zero. A child who had no classes is a real answer and must be typed; a field nobody
 * touched is a number nobody stated, and that is the one thing that must not reach an invoice.
 */
const isBlank = (childId: number) => {
  const raw = sessions[childId];
  return raw === undefined || raw === "" || Number.isNaN(Number(raw));
};

const countOf = (childId: number) =>
  isBlank(childId) ? 0 : Math.max(0, Math.trunc(Number(sessions[childId])));

/**
 * The full rate goes to the child with the most sessions, the sibling rate to the rest — so the
 * amount does not depend on the order the rows happen to arrive in. Children with no sessions do not
 * consume the full rate: a family whose only attending child is the second one still pays the
 * first-child rate for them.
 */
const rankedChildren = (parentId: number) => {
  const family = families.value.find((row) => row.parentId === parentId);
  return (family?.children ?? [])
    .map((child) => ({ childId: child.childId, count: countOf(child.childId) }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
};

const rateFor = (parentId: number, childId: number) => {
  const ranked = rankedChildren(parentId);
  const index = ranked.findIndex((entry) => entry.childId === childId);
  if (index === -1) return FIRST_CHILD_PER_SESSION;
  return index === 0 ? FIRST_CHILD_PER_SESSION : SIBLING_PER_SESSION;
};

const lineTotal = (parentId: number, childId: number) =>
  Math.round(countOf(childId) * rateFor(parentId, childId) * 100) / 100;

const totals = computed(() => {
  const map = new Map<number, number>();
  for (const family of billable.value) {
    const sum = family.children.reduce(
      (total, child) => total + lineTotal(family.parentId, child.childId),
      0
    );
    map.set(family.parentId, Math.round(sum * 100) / 100);
  }
  return map;
});

const grandTotal = computed(
  () => Math.round([...totals.value.values()].reduce((sum, value) => sum + value, 0) * 100) / 100
);

const blankCount = computed(() =>
  billable.value.reduce(
    (count, family) => count + family.children.filter((child) => isBlank(child.childId)).length,
    0
  )
);

/** Every field of this family's children has been given a value. */
const familyComplete = (family: InvoiceWorksheetRow) =>
  family.children.every((child) => !isBlank(child.childId));

/** Families who will receive an actual invoice, with a sum on it. */
const billableCount = computed(
  () => [...totals.value.values()].filter((value) => value > 0).length
);

/**
 * Families whose month comes to nothing.
 *
 * They still get a row in the database, marked as waived — a child who could not come, or a month
 * the school chose not to charge for. What they do not get is a document. Counting them separately
 * on the button matters: "12 facturi" alongside "3 fără plată" says the month is fully handled,
 * where a bare "12" would leave three families looking forgotten.
 */
const waivedCount = computed(
  () =>
    billable.value.filter(
      (family) => familyComplete(family) && (totals.value.get(family.parentId) ?? 0) === 0
    ).length
);

const skippedCount = computed(
  () => families.value.filter((family) => family.alreadyInvoiced).length
);

const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    rawFamilies.value = (await fetchWorksheet(monthIssued.value)) ?? [];
    for (const key of Object.keys(sessions)) delete sessions[Number(key)];
  } catch (err) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca lista de familii.");
  } finally {
    loading.value = false;
  }
};

const send = async () => {
  sending.value = true;
  try {
    const result = await issueInvoices({
      monthIssued: monthIssued.value,
      dateIssued: `${monthIssued.value}-01`,
      families: billable.value.map((family) => ({
        parentId: family.parentId,
        children: family.children.map((child) => ({
          childId: child.childId,
          sessions: countOf(child.childId),
        })),
      })),
    });

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
