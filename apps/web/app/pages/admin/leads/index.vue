<template>
  <AdminPage
    title="Cereri și probe"
    subtitle="Fiecare familie care a întrebat, până la înscriere sau până la un refuz scris. Nimic nu iese de aici pentru că a trecut timpul."
    width="xl"
  >
    <template #actions>
      <UBadge v-if="followUp" color="warning" variant="subtle">
        {{ followUp.undecided.length }} probe fără decizie
      </UBadge>
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
                  {{ row.lead.childFirstName }} {{ row.lead.childLastName }}
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
              <span class="font-medium">{{ row.lead.childFirstName }}</span>
              <span class="text-muted"> · {{ row.lead.parentName }} · de {{ row.days }} z.</span>
            </li>
          </ul>
        </UCard>
      </div>

      <!-- Everything open, in one table. -->
      <div class="flex flex-wrap items-center gap-3">
        <USelect v-model="statusFilter" :items="statusItems" class="w-56" />
        <UCheckbox v-model="onlyUnassigned" label="Doar fără responsabil" />
        <UCheckbox v-model="includeSettled" label="Include închise" />
        <span class="text-sm text-muted">{{ leads.length }} cereri</span>
      </div>

      <AdminTable
        :rows="leads"
        :loading="listLoading"
        empty-text="Nicio cerere"
        empty-description="Când cineva completează formularul de pe site, apare aici."
        :columns="columns"
      />
    </template>

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
        <UFormField label="Motiv" required>
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
import { computed, onMounted, ref, watch } from "vue";
import { useLeadsApi } from "~/composables/api/useLeadsApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { useUserStore } from "~/stores/userStore";
import { LEAD_SOURCE_LABELS, LEAD_STATUS_COLORS, LEAD_STATUS_LABELS } from "~/types/lead.types";
import type { LeadFollowUp, LeadStatus, LeadSummary } from "~/types/lead.types";

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
definePageMeta({ layout: "dashboard", middleware: "admin-check" });

const { fetchFollowUp, fetchLeads, updateLead, markLost } = useLeadsApi();
const userStore = useUserStore();

const followUp = ref<LeadFollowUp | null>(null);
const leads = ref<LeadSummary[]>([]);
const loading = ref(true);
const listLoading = ref(false);
const error = ref<string | null>(null);

const statusFilter = ref<LeadStatus | "">("");
const onlyUnassigned = ref(false);
const includeSettled = ref(false);

const statusItems = computed(() => [
  { label: "Toate stările", value: "" },
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
      status: statusFilter.value || undefined,
      unassigned: onlyUnassigned.value || undefined,
      includeSettled: includeSettled.value || undefined,
    });
  } finally {
    listLoading.value = false;
  }
};

watch([statusFilter, onlyUnassigned, includeSettled], loadList);

const claim = async (id: number) => {
  const me = userStore.user?.id;
  if (!me) return;
  await updateLead(id, { assignedToId: me });
  await load();
};

const lostOpen = ref(false);
const lostSaving = ref(false);
const lostReason = ref("");
const lostLead = ref<LeadSummary | null>(null);

const openLost = (lead: LeadSummary) => {
  lostLead.value = lead;
  lostReason.value = "";
  lostOpen.value = true;
};

const confirmLost = async () => {
  if (!lostLead.value) return;
  lostSaving.value = true;
  try {
    await markLost(lostLead.value.id, { reason: lostReason.value.trim() });
    lostOpen.value = false;
    await load();
  } catch (caught) {
    error.value = apiErrorMessage(caught);
  } finally {
    lostSaving.value = false;
  }
};

onMounted(load);
</script>
