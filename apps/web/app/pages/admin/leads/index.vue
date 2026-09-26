<template>
  <AdminPage
    title="Cereri și probe"
    subtitle="Fiecare familie care a întrebat, până la înscriere sau până la un refuz scris. Nimic nu iese de aici pentru că a trecut timpul."
    width="xl"
  >
    <template #actions>
      <UBadge v-if="followUp" color="warning" variant="subtle">
        {{ countOf(followUp.undecided.length, "probă fără decizie", "probe fără decizie") }}
      </UBadge>
      <UButton icon="i-lucide-plus" class="min-h-11" @click="newOpen = true">Cerere nouă</UButton>
    </template>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="followUp">
      <!-- The screen this story is built around. -->
      <UCard class="border">
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="text-xl font-semibold">Probe ținute, fără decizie</h2>
              <p class="text-sm text-muted">
                Fiecare familie de aici a primit deja un loc, un profesor și o oră de curs. Ies din
                listă înscrise sau pierdute, cu motiv.
              </p>
            </div>
          </div>
        </template>

        <AdminEmpty
          v-if="followUp.undecided.length === 0"
          bare
          icon="i-lucide-check"
          title="Nicio probă în așteptare"
          description="Toate probele ținute au primit un răspuns."
        />
        <ul v-else class="divide-y divide-default">
          <li v-for="row in followUp.undecided" :key="row.lead.id" class="py-3">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium">
                  <button
                    type="button"
                    class="underline underline-offset-2 text-left"
                    :aria-label="`Deschide cererea pentru ${row.lead.childFirstName} ${row.lead.childLastName}`"
                    @click="openFile(row.lead)"
                  >
                    {{ row.lead.childFirstName }} {{ row.lead.childLastName }}
                  </button>
                  <span class="text-muted">· {{ row.lead.parentName }}</span>
                </p>
                <p class="text-sm text-muted">
                  {{ row.lead.group?.name ?? "Fără grupă" }} ·
                  <span :class="row.days >= 3 ? 'text-warning font-medium' : ''">
                    de {{ row.days }} {{ row.days === 1 ? "zi" : "zile" }}
                  </span>
                  · {{ row.lead.assignedTo?.username ?? "fără responsabil" }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  v-if="!row.lead.assignedTo"
                  size="xs"
                  variant="outline"
                  @click="claim(row.lead.id)"
                  >Preiau eu</UButton
                >
                <UButton size="xs" variant="outline" color="neutral" @click="openLost(row.lead)"
                  >Pierdut</UButton
                >
              </div>
            </div>
          </li>
        </ul>
      </UCard>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <UCard v-for="panel in panels" :key="panel.title" class="border">
          <template #header>
            <h3 class="font-semibold">{{ panel.title }}</h3>
            <p class="text-sm text-muted">{{ panel.hint }}</p>
          </template>
          <p v-if="panel.rows.length === 0" class="text-sm text-muted">Nimic aici.</p>
          <ul v-else class="space-y-2">
            <li v-for="row in panel.rows" :key="row.lead.id" class="text-sm">
              <button
                type="button"
                class="font-medium underline underline-offset-2"
                :aria-label="`Deschide cererea pentru ${row.lead.childFirstName} ${row.lead.childLastName}, ${panel.title}`"
                @click="openFile(row.lead)"
              >
                {{ row.lead.childFirstName }}
              </button>
              <span class="text-muted"> · {{ row.lead.parentName }} · de {{ row.days }} z.</span>
            </li>
          </ul>
        </UCard>
      </div>

      <!-- Everything open, in one table. -->
      <AdminFilterBar layout="row" :count-label="countOf(leads.length, 'cerere', 'cereri')">
        <!-- Cele două bife de alături își poartă eticheta; asta n-o avea deloc. -->
        <USelect
          v-model="statusFilter"
          :items="statusItems"
          class="w-56"
          aria-label="Filtrează după stare"
        />
        <UCheckbox v-model="onlyUnassigned" label="Doar fără responsabil" />
        <UCheckbox v-model="includeSettled" label="Include închise" />
      </AdminFilterBar>

      <AdminTable
        :rows="leads"
        :loading="listLoading"
        empty-text="Nicio cerere"
        empty-description="Când cineva completează formularul de pe site, apare aici."
        :columns="columns"
        :actions="rowActions"
      />
    </template>

    <AdminLeadFile
      v-model:open="fileOpen"
      :lead="fileLead"
      @changed="onFileChanged"
      @lose="loseFromFile"
    />
    <AdminLeadNew v-model:open="newOpen" @created="onCreated" />

    <AdminConfirmModal
      v-model:open="lostOpen"
      title="Închide cererea"
      confirm-label="Închide cererea"
      :loading="lostSaving"
      @confirm="confirmLost"
    >
      <template #body>
        <p class="text-sm text-muted">
          Scrie de ce nu continuă {{ lostLead?.childFirstName ?? "familia" }}. Motivul rămâne pe
          cerere — o cerere nu iese din liste pentru că a trecut timpul.
        </p>
        <UFormField label="Motiv" required :error="lostError">
          <UInput
            v-model="lostReason"
            placeholder="ex. programul nu li se potrivește"
            class="w-full"
          />
        </UFormField>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import { countOf } from "~/composables/useRomanianCount";
import { computed, onMounted, ref, watch } from "vue";
import { useLeadsApi } from "~/composables/api/useLeadsApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { useUserStore } from "~/stores/userStore";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from "~/types/lead.types";
import type { LeadFollowUp, LeadStatus, LeadSummary } from "~/types/lead.types";
import { useNotifications } from "~/composables/useNotifications";

/**
 * The office's screen — E20/S1 and S3.
 *
 * The order on the page is the order of what it costs to lose a family, not the order the rows were
 * created in: trials already held come first, because that family has been given a seat, a teacher
 * and an hour of class and the only thing between them and an enrolment is somebody remembering.
 *
 * There is no "set status" control anywhere on this page, and that is deliberate: „probă ținută"
 * comes from the register and „înscris" from the enrolment in E11. A dropdown here would let the
 * screen declare a family enrolled that nobody enrolled — and that is the number the funnel report
 * is built on.
 */
definePageMeta({ layout: "dashboard", middleware: "admin-check", title: "Cereri și probe" });

const { fetchFollowUp, fetchLeads, updateLead, markLost } = useLeadsApi();
const userStore = useUserStore();

const followUp = ref<LeadFollowUp | null>(null);
const leads = ref<LeadSummary[]>([]);
const loading = ref(true);
const listLoading = ref(false);
const error = ref<string | null>(null);

/**
 * "Every state" as a value of its own, not as the empty string.
 *
 * An empty value is reserved: reka-ui's `SelectItem` throws on one, because `""` is how a select
 * is cleared. The item was simply dropped from the menu — and the trigger still read "Toate
 * stările", so nothing looked wrong until somebody filtered once and found no way back to the full
 * list. `/admin/orar` already spells this the same way.
 */
const ALL_STATES = "all";

const statusFilter = ref<LeadStatus | typeof ALL_STATES>(ALL_STATES);
const onlyUnassigned = ref(false);
const includeSettled = ref(false);

const statusItems = computed(() => [
  { label: "Toate stările", value: ALL_STATES },
  ...Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ label, value })),
]);

const panels = computed(() => [
  {
    title: "Fără loc liber",
    hint: "Cereri pe care școala nu le-a putut servi. Nimic nu le sună înapoi în locul cuiva.",
    rows: followUp.value?.noSeats ?? [],
  },
  {
    title: "Fără mișcare",
    hint: "O săptămână sau mai mult de când nu s-a întâmplat nimic.",
    rows: followUp.value?.stale ?? [],
  },
  {
    title: "Scadente",
    hint: "Pasul următor era pentru azi sau mai devreme.",
    rows: followUp.value?.due ?? [],
  },
]);

const columns = [
  {
    key: "childFirstName",
    label: "Copil",
    accessor: (lead: LeadSummary) => `${lead.childFirstName} ${lead.childLastName}`,
  },
  { key: "parentName", label: "Familie" },
  {
    key: "status",
    label: "Stare",
    type: "badge" as const,
    accessor: (lead: LeadSummary) => LEAD_STATUS_LABELS[lead.status],
    badgeColor: (lead: LeadSummary) => LEAD_STATUS_COLORS[lead.status],
  },
  {
    key: "source",
    label: "De unde",
    accessor: (lead: LeadSummary) => LEAD_SOURCE_LABELS[lead.source],
  },
  { key: "group", label: "Grupă", accessor: (lead: LeadSummary) => lead.group?.name ?? "—" },
  { key: "lastActivityAt", label: "Ultima mișcare", type: "date" as const },
];

const load = async () => {
  loading.value = true;
  error.value = null;
  try {
    followUp.value = await fetchFollowUp();
    await loadList();
  } catch (caught) {
    error.value = apiErrorMessage(caught);
  } finally {
    loading.value = false;
  }
};

const loadList = async () => {
  listLoading.value = true;
  try {
    leads.value = await fetchLeads({
      status: statusFilter.value === ALL_STATES ? undefined : statusFilter.value,
      unassigned: onlyUnassigned.value || undefined,
      includeSettled: includeSettled.value || undefined,
    });
  } finally {
    listLoading.value = false;
  }
};

watch([statusFilter, onlyUnassigned, includeSettled], loadList);

/** One request, opened: contact, trial, notes, next step, owner — `AdminLeadFile`. */
const fileOpen = ref(false);
const fileLead = ref<LeadSummary | null>(null);
const newOpen = ref(false);
const { success: notifySuccess, error: notifyError } = useNotifications();

const openFile = (lead: LeadSummary) => {
  fileLead.value = lead;
  fileOpen.value = true;
};

const rowActions = (lead: LeadSummary) => [
  { label: "Deschide cererea", icon: "i-lucide-folder-open", onSelect: () => openFile(lead) },
];

const onFileChanged = async (lead: LeadSummary) => {
  fileLead.value = lead;
  await load();
};

const loseFromFile = (lead: LeadSummary) => {
  fileOpen.value = false;
  openLost(lead);
};

const onCreated = async (lead: LeadSummary) => {
  await load();
  openFile(lead);
};

const claim = async (id: number) => {
  const me = userStore.user?.id;
  if (!me) return;
  try {
    await updateLead(id, { assignedToId: me });
    await load();
  } catch (caught) {
    notifyError(apiErrorMessage(caught, "Nu am putut prelua cererea."));
  }
};

const lostOpen = ref(false);
const lostSaving = ref(false);
const lostReason = ref("");
const lostLead = ref<LeadSummary | null>(null);

const lostError = ref<string | undefined>(undefined);
watch(lostReason, () => (lostError.value = undefined));

const openLost = (lead: LeadSummary) => {
  lostLead.value = lead;
  lostReason.value = "";
  lostError.value = undefined;
  lostOpen.value = true;
};

/**
 * The reason is checked here and a refusal stays in the dialog. A short reason used to be sent,
 * refused with class-validator's English, and shown as the error of the whole page — which replaced
 * the lists the office was working from (QA of 26 September 2026).
 */
const confirmLost = async () => {
  if (!lostLead.value) return;
  const reason = lostReason.value.trim();
  if (reason.length < 3) {
    lostError.value = "Scrie motivul în câteva cuvinte (cel puțin 3 caractere).";
    return;
  }
  lostSaving.value = true;
  try {
    await markLost(lostLead.value.id, { reason });
    lostOpen.value = false;
    notifySuccess("Cererea a fost închisă.");
    await load();
  } catch (caught) {
    lostError.value = apiErrorMessage(caught, "Nu am putut închide cererea.");
  } finally {
    lostSaving.value = false;
  }
};

onMounted(load);
</script>
