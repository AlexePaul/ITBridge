<template>
  <AdminPage
    title="Rapoarte"
    subtitle="Banii lună de lună, locurile din fiecare grupă, și drumul de la o cerere la o înscriere. Nimic de aici nu e o definiție nouă: restanțele vin de la ecranul de restanțe, locurile de la înscrieri, pâlnia de la cereri."
    width="xl"
  >
    <UTabs v-model="tab" :items="tabs" :content="false" color="neutral" class="w-full sm:w-auto" />

    <!-- ============================== BANI ============================== -->
    <section v-if="tab === 'bani'" class="space-y-6">
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="loadFinance">
        <UFormField label="De la">
          <UInput v-model="from" type="month" />
        </UFormField>
        <UFormField label="Până la">
          <UInput v-model="to" type="month" />
        </UFormField>
        <UButton
          type="submit"
          :disabled="!rangeValid"
          :loading="financeLoading"
          icon="i-lucide-search"
        >
          Arată
        </UButton>
        <p v-if="!rangeValid" class="text-sm text-error">Alege două luni, în ordine.</p>
      </form>

      <AdminLoading v-if="financeLoading && !finance" />
      <AdminError v-else-if="financeError" :message="financeError" />

      <template v-else-if="finance">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            v-for="tile in financeTiles"
            :key="tile.label"
            class="border border-muted rounded-lg p-4"
          >
            <p class="text-2xl font-semibold tabular-nums">{{ tile.display }}</p>
            <p class="text-sm text-muted mt-0.5">{{ tile.label }}</p>
            <p v-if="tile.note" class="text-xs text-muted mt-1">{{ tile.note }}</p>
          </div>
        </div>

        <!-- Two calendars, both shown. Hiding one inside the other is how a money report ends up
             right on quiet months and wrong on the ones that matter. -->
        <p class="text-sm text-muted">
          <strong>Încasat pentru lună</strong> = plățile pe facturile lunii, oricând au venit;
          diferența față de facturat e ce mai datorează luna. <strong>Încasat în lună</strong> =
          plățile datate în lună, pentru orice factură — cifra pe care o are banca. Diferă exact
          când o familie plătește târziu.
        </p>

        <AdminTable
          :rows="finance.months"
          :columns="monthColumns"
          empty-text="Nicio lună în interval."
          empty-icon="i-lucide-calendar"
        />

        <section class="space-y-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">Restanțe acum</h2>
            <UButton
              to="/admin/restante"
              color="neutral"
              variant="ghost"
              size="sm"
              trailing-icon="i-lucide-arrow-right"
            >
              Lista de restanțe
            </UButton>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="band in buckets" :key="band" class="border border-muted rounded-lg p-4">
              <p class="text-2xl font-semibold tabular-nums">
                {{ formatLei(finance.arrears.byBucket[band].outstanding) }}
              </p>
              <p class="text-sm text-muted">{{ ARREARS_BUCKET_LABELS[band] }}</p>
              <p class="text-xs text-muted mt-1 tabular-nums">
                {{ finance.arrears.byBucket[band].invoices }}
                {{ finance.arrears.byBucket[band].invoices === 1 ? "factură" : "facturi" }}
              </p>
            </div>
          </div>
        </section>

        <!-- What the numbers rest on. A report built on incomplete data misleads worse than none. -->
        <p class="text-xs text-muted">
          Calculat la {{ formatDateKey(finance.generatedOn) }} din
          {{ finance.basis.billableInvoices }}
          {{ finance.basis.billableInvoices === 1 ? "factură" : "facturi" }} și
          {{ finance.basis.succeededPayments }} plăți reușite datate în interval;
          {{ finance.basis.waivedInvoices }} luni anulate la 0 lei nu intră în facturat.
          <template
            v-if="
              finance.basis.initiatedPayments ||
              finance.basis.reversedPayments ||
              finance.basis.failedPayments
            "
          >
            Neincluse, fiindcă nu sunt bani ajunși: {{ finance.basis.initiatedPayments }} anunțate,
            {{ finance.basis.reversedPayments }} stornate,
            {{ finance.basis.failedPayments }} eșuate.
          </template>
          Fără împărțire pe locație — o factură e a familiei, iar o familie poate avea copii la
          ambele adrese.
        </p>
      </template>
    </section>

    <!-- ============================== LOCURI ============================== -->
    <section v-else-if="tab === 'locuri'" class="space-y-6">
      <AdminLoading v-if="occupancyLoading" />
      <AdminError v-else-if="occupancyError" :message="occupancyError" />

      <template v-else-if="occupancy">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            v-for="tile in occupancyTiles"
            :key="tile.label"
            class="border border-muted rounded-lg p-4"
          >
            <p class="text-2xl font-semibold tabular-nums">{{ tile.display }}</p>
            <p class="text-sm text-muted mt-0.5">{{ tile.label }}</p>
            <p v-if="tile.note" class="text-xs text-muted mt-1">{{ tile.note }}</p>
          </div>
        </div>

        <section class="space-y-3">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">Pe locație</h2>
          <div class="grid sm:grid-cols-2 gap-3">
            <div
              v-for="loc in occupancy.locations"
              :key="loc.locationId"
              class="border border-muted rounded-lg p-4 space-y-1"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="font-medium">{{ loc.name }}</p>
                <UBadge :color="fillColor(loc.fillRate)" variant="subtle" size="sm">
                  {{ formatPercent(loc.fillRate) }}
                </UBadge>
              </div>
              <p class="text-sm text-muted tabular-nums">
                {{ loc.taken }} din {{ loc.capacity }} locuri · {{ loc.groups }}
                {{ loc.groups === 1 ? "grupă" : "grupe" }} în {{ loc.rooms }}
                {{ loc.rooms === 1 ? "sală" : "săli" }}
                <span v-if="loc.waiting > 0"> · {{ loc.waiting }} în așteptare</span>
              </p>
              <p v-if="loc.free > 0" class="text-sm text-muted tabular-nums">
                {{ loc.free }} {{ loc.free === 1 ? "loc liber" : "locuri libere" }} · ~{{
                  formatLei(loc.lostRevenueMonthly)
                }}
                pe lună la prețul de listă
              </p>
            </div>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
              Grupe, cele mai goale primele
            </h2>
            <p class="text-sm text-muted">
              Sub {{ formatPercent(occupancy.threshold) }} = sub prag
            </p>
          </div>
          <AdminTable
            :rows="occupancy.groups"
            :columns="groupColumns"
            empty-text="Nicio grupă activă."
            empty-icon="i-lucide-users-round"
            @row-click="(row) => navigateTo(`/admin/groups/${row.groupId}/children`)"
          />
        </section>

        <section class="space-y-3">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">
            Sălile și orele moarte
          </h2>
          <p class="text-sm text-muted">
            O oră e „moartă” într-o sală când în altă sală se ține curs la ora aia. Orarul școlii nu
            are grilă fixă, deci asta e singura măsură onestă a unei ore în care sala
            <em>putea</em> fi folosită.
          </p>
          <div class="space-y-2">
            <div
              v-for="room in occupancy.rooms"
              :key="room.roomId"
              class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border border-muted rounded-lg p-4"
            >
              <div class="min-w-0">
                <p class="font-medium">
                  {{ room.roomName }} <span class="text-muted">· {{ room.locationName }}</span>
                </p>
                <p class="text-sm text-muted tabular-nums">
                  {{ room.groups }} {{ room.groups === 1 ? "grupă" : "grupe" }}
                  <template v-if="room.groups > 0">
                    · {{ room.taken }} din {{ room.capacity }} locuri ({{
                      formatPercent(room.fillRate)
                    }})</template
                  >
                  · {{ room.roomCapacity }} scaune în sală
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5 sm:justify-end sm:max-w-md">
                <UBadge
                  v-if="room.deadSlots.length === 0"
                  color="success"
                  variant="subtle"
                  size="sm"
                >
                  Folosită în toate orele școlii
                </UBadge>
                <UBadge
                  v-for="slot in room.deadSlots"
                  :key="slotKey(slot)"
                  color="neutral"
                  variant="outline"
                  size="sm"
                >
                  {{ slotLabel(slot) }}
                </UBadge>
              </div>
            </div>
          </div>
        </section>

        <p class="text-xs text-muted">
          Calculat la {{ formatDateKey(occupancy.generatedOn) }}. Ocupat = înscrieri în vigoare,
          probele incluse — un copil la probă stă pe un scaun. Grupele și sălile inactive nu apar:
          nu pot primi un copil nou. Venitul pierdut e o estimare la
          {{ formatLei(occupancy.ratePerSeat) }} pe loc pe lună, prețul de listă al primului copil;
          frații și reducerile îl fac mai mic. Pragul de {{ formatPercent(occupancy.threshold) }} e
          o propunere, nu o decizie.
        </p>
      </template>
    </section>

    <!-- ============================== PÂLNIA ============================== -->
    <section v-else-if="tab === 'palnie'" class="space-y-6">
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="loadFunnel">
        <UFormField label="De la">
          <UInput v-model="funnelFrom" type="date" />
        </UFormField>
        <UFormField label="Până la">
          <UInput v-model="funnelTo" type="date" />
        </UFormField>
        <UButton type="submit" :loading="funnelLoading">Arată</UButton>
      </form>

      <AdminLoading v-if="funnelLoading" />
      <AdminError v-else-if="funnelError" :message="funnelError" @retry="loadFunnel" />

      <template v-else-if="funnel">
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <UCard v-for="stage in funnelStages" :key="stage.label" class="border">
            <p class="text-sm text-muted">{{ stage.label }}</p>
            <p class="text-2xl font-semibold tabular-nums">{{ stage.value }}</p>
            <p v-if="stage.rate !== undefined" class="text-xs text-muted tabular-nums">
              {{ stage.rate }}% din pasul dinainte
            </p>
          </UCard>
        </div>

        <UCard class="border">
          <template #header>
            <h2 class="text-xl font-semibold">Proba ținută → înscriere</h2>
            <p class="text-sm text-muted">
              Cifra care contează cel mai mult, și singura care măsoară două lucruri deodată: dacă
              familiei i-a plăcut ora, și dacă a apucat cineva să o înscrie. De aceea mediana de
              alături merge cu ea — dacă rata scade în timp ce mediana crește, de vină e lista de
              urmărire, nu ora de curs.
            </p>
          </template>
          <div class="flex flex-wrap gap-8">
            <div>
              <p class="text-sm text-muted">Conversie</p>
              <p class="text-3xl font-semibold tabular-nums">
                {{ funnel.rates.attendanceToEnrolment }}%
              </p>
            </div>
            <div>
              <p class="text-sm text-muted">Mediana până la decizie</p>
              <p class="text-3xl font-semibold tabular-nums">
                {{
                  funnel.medianDaysToDecision === null ? "—" : `${funnel.medianDaysToDecision} z.`
                }}
              </p>
            </div>
            <div>
              <p class="text-sm text-muted">Cereri fără loc liber</p>
              <p class="text-3xl font-semibold tabular-nums">{{ funnel.stages.noSeats }}</p>
            </div>
          </div>
        </UCard>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <UCard class="border">
            <template #header>
              <h3 class="font-semibold">De unde spun că au auzit de noi</h3>
              <p class="text-sm text-muted">
                Declarat de familie, nu dedus: E20/S5 a decis să nu existe coduri de recomandare,
                deci „recomandare" e cuvântul unui părinte, nu o atribuire.
              </p>
            </template>
            <p v-if="funnel.byChannel.length === 0" class="text-sm text-muted">Nimic încă.</p>
            <ul v-else class="space-y-1 text-sm">
              <li v-for="row in funnel.byChannel" :key="row.key" class="flex justify-between gap-4">
                <span>{{ channelLabel(row.key) }}</span>
                <span class="tabular-nums text-muted">
                  {{ row.requests }} cereri · {{ row.enrolled }} înscrieri
                </span>
              </li>
            </ul>
          </UCard>

          <UCard class="border">
            <template #header>
              <h3 class="font-semibold">Cine a plecat fără oră</h3>
              <p class="text-sm text-muted">
                Pe locație și pe vârstă. E singura măsură a cererii pe care școala nu a putut-o
                servi — un părinte care nu găsește nicio oră liberă nu apare în nicio rată de
                conversie, fiindcă n-a intrat niciodată în pâlnie.
              </p>
            </template>
            <p v-if="funnel.unmetByBand.length === 0" class="text-sm text-muted">
              Nimeni. Toate cererile au găsit un loc.
            </p>
            <ul v-else class="space-y-1 text-sm">
              <li
                v-for="row in funnel.unmetByBand"
                :key="`${row.locationId}-${row.ageBand}`"
                class="flex justify-between gap-4"
              >
                <span>{{ row.locationName }} · {{ row.ageBand }}</span>
                <span class="tabular-nums text-muted">{{ row.count }}</span>
              </li>
            </ul>
          </UCard>
        </div>
      </template>
    </section>
  </AdminPage>
</template>

<script setup lang="ts">
import type { TabsItem } from "@nuxt/ui";
import { apiErrorMessage } from "~/composables/useApiError";
import { useReportsApi } from "~/composables/api/useReportsApi";
import { useLeadsApi } from "~/composables/api/useLeadsApi";
import { LEAD_CHANNEL_LABELS } from "~/types/lead.types";
import type { LeadChannel, LeadFunnel } from "~/types/lead.types";
import { formatDateKey, formatLei, formatMonth, formatPercent } from "~/composables/useAdminFormat";
import { defaultReportRange, isValidRange } from "~/composables/useReportRange";
import { todayKey } from "~/composables/useAttendanceCalendar";
import type { AdminBadgeColor, AdminTableColumn } from "~/types/admin-ui.types";
import type { ArrearsBucket } from "~/types/arrears.types";
import { ARREARS_BUCKET_LABELS } from "~/types/arrears.types";
import { WEEKDAY_LABELS, type Weekday } from "~/types/group.types";
import type {
  FinanceMonth,
  FinanceReport,
  OccupancyGroup,
  OccupancyReport,
  TimetableSlot,
} from "~/types/reports.types";

/**
 * Rapoarte — E21/S2 (bani) și S4 (locuri).
 *
 * Two questions on one page: "se facturează bine și se încasează prost?" and "deschidem o grupă
 * nouă, sau întâi le umplem pe cele existente?". Like the overview, nothing here is computed on the
 * screen from raw rows — every figure arrives from the service that owns its definition, and the
 * page only names it and says what it rests on.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Rapoarte",
});

const reportsApi = useReportsApi();
const route = useRoute();
const router = useRouter();

const tabs: TabsItem[] = [
  { label: "Bani", icon: "i-lucide-wallet", value: "bani" },
  { label: "Locuri", icon: "i-lucide-armchair", value: "locuri" },
  { label: "Pâlnia", icon: "i-lucide-filter", value: "palnie" },
];
const TABS = new Set(tabs.map((entry) => entry.value as string));
const tab = ref<string>(TABS.has(String(route.query.tab)) ? String(route.query.tab) : "bani");
watch(tab, (value) => router.replace({ query: { ...route.query, tab: value } }));

// ---- Pâlnia (E20/S4) ------------------------------------------------------------------------

const { fetchFunnel } = useLeadsApi();
const funnelFrom = ref("");
const funnelTo = ref("");
const funnelLoading = ref(false);
const funnelError = ref("");
const funnel = ref<LeadFunnel | null>(null);

const funnelStages = computed(() => {
  if (!funnel.value) return [];
  const { stages, rates } = funnel.value;
  return [
    { label: "Cereri", value: stages.requests },
    { label: "Probe programate", value: stages.trialsScheduled, rate: rates.requestToTrial },
    { label: "Probe ținute", value: stages.trialsHeld, rate: rates.trialToAttendance },
    { label: "Înscrieri", value: stages.enrolled, rate: rates.attendanceToEnrolment },
    { label: "Pierdute", value: stages.lost },
  ];
});

const channelLabel = (key: string) =>
  key === "unspecified" ? "N-au spus" : (LEAD_CHANNEL_LABELS[key as LeadChannel] ?? key);

const loadFunnel = async () => {
  funnelLoading.value = true;
  funnelError.value = "";
  try {
    funnel.value = await fetchFunnel({
      from: funnelFrom.value || undefined,
      to: funnelTo.value || undefined,
    });
    // The server decides the default window, so the fields show what was actually asked rather than
    // staying empty next to numbers that came from somewhere.
    funnelFrom.value ||= funnel.value.range.from;
    funnelTo.value ||= funnel.value.range.to;
  } catch (caught) {
    funnelError.value = apiErrorMessage(caught);
  } finally {
    funnelLoading.value = false;
  }
};

// `immediate`, like the occupancy tab above: without it a deep link to `?tab=palnie` — or a refresh
// while standing on it — renders the panel with nothing in it and nothing loading, because the
// watcher only ever fires on a *change* of tab.
watch(
  tab,
  (value) => {
    if (value === "palnie" && !funnel.value) void loadFunnel();
  },
  { immediate: true }
);

// ---- Bani -----------------------------------------------------------------------------------

const initial = defaultReportRange(todayKey());
const from = ref(initial.from);
const to = ref(initial.to);
const rangeValid = computed(() => isValidRange(from.value, to.value));

const financeLoading = ref(false);
const financeError = ref("");
const finance = ref<FinanceReport | null>(null);

const loadFinance = async () => {
  if (!rangeValid.value) return;
  financeLoading.value = true;
  financeError.value = "";
  try {
    finance.value = await reportsApi.fetchFinanceReport(from.value, to.value);
  } catch (err: unknown) {
    financeError.value = apiErrorMessage(err, "Eroare la încărcarea raportului financiar");
  } finally {
    financeLoading.value = false;
  }
};

const financeTiles = computed(() => {
  const data = finance.value;
  if (!data) return [];
  const gap = Math.round((data.totals.invoiced - data.totals.collectedForMonth) * 100) / 100;
  return [
    {
      label: "Facturat",
      display: formatLei(data.totals.invoiced),
      note: `${data.totals.invoices} facturi · ${data.totals.families} familii`,
    },
    {
      label: "Încasat pentru lunile alese",
      display: formatLei(data.totals.collectedForMonth),
      note: gap > 0 ? `${formatLei(gap)} încă de încasat` : "tot ce s-a facturat",
    },
    {
      label: "Încasat în lunile alese",
      display: formatLei(data.totals.collectedInMonth),
      note: `${formatLei(data.totals.byMethod.cash)} numerar · ${formatLei(data.totals.byMethod.bankTransfer)} transfer`,
    },
    {
      label: "Medie pe familie",
      display: formatLei(data.totals.averagePerFamily),
      note:
        data.arrears.families > 0
          ? `restanțe: ${formatLei(data.arrears.outstanding)}, ${data.arrears.families} ${data.arrears.families === 1 ? "familie" : "familii"}`
          : "nicio restanță acum",
    },
  ];
});

const buckets: ArrearsBucket[] = ["due_soon", "overdue", "over_30", "over_60"];

const monthColumns: AdminTableColumn<FinanceMonth>[] = [
  {
    key: "month",
    label: "Luna",
    icon: "i-lucide-calendar",
    accessor: (row) => formatMonth(row.month),
  },
  {
    key: "invoices",
    label: "Facturi",
    accessor: (row) =>
      row.waived > 0 ? `${row.invoices} (+${row.waived} la 0 lei)` : row.invoices,
  },
  { key: "families", label: "Familii" },
  { key: "invoiced", label: "Facturat", type: "money" },
  { key: "collectedForMonth", label: "Încasat pentru lună", type: "money" },
  { key: "outstanding", label: "De încasat", type: "money" },
  { key: "collectedInMonth", label: "Încasat în lună", type: "money" },
  { key: "cash", label: "Numerar", type: "money", accessor: (row) => row.byMethod.cash },
  {
    key: "bankTransfer",
    label: "Transfer",
    type: "money",
    accessor: (row) => row.byMethod.bankTransfer,
  },
];

// ---- Locuri ---------------------------------------------------------------------------------

const occupancyLoading = ref(false);
const occupancyError = ref("");
const occupancy = ref<OccupancyReport | null>(null);

const loadOccupancy = async () => {
  if (occupancy.value) return;
  occupancyLoading.value = true;
  occupancyError.value = "";
  try {
    occupancy.value = await reportsApi.fetchOccupancyReport();
  } catch (err: unknown) {
    occupancyError.value = apiErrorMessage(err, "Eroare la încărcarea raportului de ocupare");
  } finally {
    occupancyLoading.value = false;
  }
};

const fillColor = (rate: number): AdminBadgeColor => {
  // The threshold is the report's, never a copy; 0.9 is only a colour band for the screen.
  const threshold = occupancy.value?.threshold;
  if (threshold === undefined) return "neutral";
  if (rate >= 0.9) return "success";
  if (rate >= threshold) return "neutral";
  return "warning";
};

const occupancyTiles = computed(() => {
  const data = occupancy.value;
  if (!data) return [];
  return [
    {
      label: "Locuri ocupate",
      display: `${data.totals.taken} / ${data.totals.capacity}`,
      note: `${formatPercent(data.totals.fillRate)} din capacitate, ${data.totals.groups} grupe`,
    },
    {
      label: "Locuri libere",
      display: String(data.totals.free),
      note:
        data.totals.waiting > 0
          ? `${data.totals.waiting} pe liste de așteptare`
          : "nimeni în așteptare",
    },
    {
      label: "Grupe sub prag",
      display: String(data.totals.underThreshold),
      note: `sub ${formatPercent(data.threshold)} ocupare`,
    },
    {
      label: "Venit pierdut estimat",
      display: `~${formatLei(data.totals.lostRevenueMonthly)}`,
      note: "pe lună, la prețul de listă",
    },
  ];
});

const slotLabel = (slot: TimetableSlot) =>
  `${WEEKDAY_LABELS[slot.weekday as Weekday] ?? slot.weekday} ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`;
const slotKey = (slot: TimetableSlot) => `${slot.weekday}-${slot.startTime}-${slot.endTime}`;

const groupColumns: AdminTableColumn<OccupancyGroup>[] = [
  { key: "name", label: "Grupa", icon: "i-lucide-users-round" },
  { key: "where", label: "Unde", accessor: (row) => `${row.locationName} · ${row.roomName}` },
  { key: "when", label: "Când", accessor: (row) => slotLabel(row) },
  {
    key: "seats",
    label: "Ocupate",
    align: "right",
    accessor: (row) => `${row.taken} / ${row.capacity}`,
  },
  { key: "free", label: "Libere", align: "right" },
  {
    key: "fillRate",
    label: "Grad",
    type: "badge",
    accessor: (row) =>
      row.underThreshold
        ? `${formatPercent(row.fillRate)} · sub prag`
        : formatPercent(row.fillRate),
    badgeColor: (row) => fillColor(row.fillRate),
  },
  { key: "waiting", label: "În așteptare", align: "right" },
  { key: "lostRevenueMonthly", label: "Venit pierdut / lună", type: "money" },
];

watch(tab, (value) => value === "locuri" && loadOccupancy(), { immediate: true });
onMounted(loadFinance);
</script>
