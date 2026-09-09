<template>
  <AdminPage title="Editare copil" back-to="/admin/children">
    <UCard variant="subtle">
      <UForm :schema="schema" :state="state" class="space-y-5 w-full" @submit="handleSubmit">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField name="firstName">
            <template #label>Prenume<span class="text-error">*</span></template>
            <UInput v-model="state.firstName" placeholder="ex. John" />
          </UFormField>

          <UFormField name="lastName">
            <template #label>Nume<span class="text-error">*</span></template>
            <UInput v-model="state.lastName" placeholder="ex. Doe" />
          </UFormField>
        </div>

        <UFormField name="birthDate">
          <template #label>Data Nașterii<span class="text-error">*</span></template>
          <AdminDateField v-model="state.birthDate" :max="today" label="data nașterii" />
        </UFormField>

        <AdminFormActions
          submit-label="Salvează modificări"
          cancel-to="/admin/children"
          :loading="saving"
        />
      </UForm>
    </UCard>

    <!--
    E11/S1. The history is the answer to "which group was this child in last October" — the question
    the old single foreign key on `Child` could not answer at all, and the one that comes up when a
    family disputes an invoice.
  -->
    <UCard variant="subtle">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-history" class="text-primary" />
          <h2 class="text-xl font-bold">Istoricul înscrierilor</h2>
        </div>
      </template>

      <AdminLoading v-if="historyLoading" />

      <AdminEmpty
        v-else-if="history.length === 0"
        bare
        title="Copilul nu a fost înscris în nicio grupă."
        icon="i-lucide-history"
      />

      <div v-else class="space-y-3">
        <div
          v-for="entry in history"
          :key="entry.id"
          class="flex items-start justify-between gap-4 p-4 border border-gray-200 rounded-lg"
        >
          <div>
            <p class="font-semibold">
              {{ entry.group?.name ?? "Grupă ștearsă" }}
              <UBadge
                :color="entry.endDate === null ? 'success' : 'neutral'"
                variant="subtle"
                size="sm"
                class="ml-2"
              >
                {{ ENROLLMENT_STATUS_LABELS[entry.status] }}
              </UBadge>
            </p>
            <p class="text-sm text-muted">{{ periodOf(entry) }}</p>
            <p v-if="entry.exitReason" class="text-sm text-muted">{{ entry.exitReason }}</p>
          </div>
          <p v-if="entry.contractSignedAt" class="text-sm text-muted whitespace-nowrap">
            Contract {{ formatDate(entry.contractSignedAt) }}
          </p>
          <!-- E07/S8: an active enrolment with nothing on file says so, and takes the day here,
             without a detour through the list — a trial has no contract, so it shows nothing. -->
          <div
            v-else-if="entry.status === 'ACTIVE' && entry.endDate === null"
            class="flex items-end gap-2 shrink-0"
          >
            <UFormField label="Contract semnat la" name="contractSignedAt">
              <AdminDateField
                v-model="contractDay"
                :max="today"
                label="data semnării contractului"
              />
            </UFormField>
            <UButton
              color="warning"
              variant="soft"
              class="min-h-11"
              :loading="recordingContract"
              :disabled="recordingContract || !DATE_KEY_PATTERN.test(contractDay ?? '')"
              @click="recordContractFor(entry)"
            >
              Fără contract — consemnează
            </UButton>
          </div>
        </div>
      </div>

      <template v-if="inForce" #footer>
        <!--
        E11/S5. A transfer is the only way a child changes group, because D6 forbids a second
        enrolment in force — so this is a move, not an add, and it says so.
      -->
        <div class="flex flex-col sm:flex-row sm:items-center gap-3">
          <USelect
            v-model="transferTargetId"
            :items="transferOptions"
            placeholder="Mută în altă grupă…"
            aria-label="Grupa în care se mută copilul"
            class="flex-1"
          />
          <UButton
            color="primary"
            :disabled="!transferTargetId || transferring"
            :loading="transferring"
            @click="handleTransfer"
          >
            Transferă
          </UButton>
        </div>
        <p class="text-sm text-muted mt-2">
          Închide înscrierea curentă și o deschide pe cea nouă, într-o singură operațiune. Istoricul
          păstrează ambele perioade.
        </p>
      </template>
    </UCard>
  </AdminPage>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { Child } from "~/types/child.types";
import { useChildrenStore } from "~/stores/childrenStore";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useNotifications } from "~/composables/useNotifications";
import { normalizeName } from "~/composables/useUtils";
import { useEnrollmentsApi } from "~/composables/api/useEnrollmentsApi";
import type { Enrollment } from "~/types/enrollment.types";
import { ENROLLMENT_STATUS_LABELS } from "~/types/enrollment.types";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useGroupsStore } from "~/stores/groupsStore";
import { apiErrorMessage } from "~/composables/useApiError";
import { DATE_KEY_PATTERN } from "~/composables/useDateField";
import { todayKey } from "~/composables/useAttendanceCalendar";

const route = useRoute();
const childrenStore = useChildrenStore();
const childrenApi = useChildrenApi();
const enrollmentsApi = useEnrollmentsApi();

const { success } = useNotifications();

const groupsApi = useGroupsApi();
const groupsStore = useGroupsStore();
const { error: notifyError } = useNotifications();

const history = ref<Enrollment[]>([]);
const historyLoading = ref(true);
const saving = ref(false);
/** Nobody enrols a child who is not born yet; the calendar stops at today. */
const today = todayKey();
const transferTargetId = ref<number | undefined>();
const transferring = ref(false);

// E07/S8: the day on the paper, recorded from here for the running enrolment. Defaults to today —
// most contracts are recorded the day they are signed — and the calendar stops there.
const contractDay = ref<string | undefined>(today);
const recordingContract = ref(false);

const recordContractFor = async (entry: Enrollment) => {
  const day = contractDay.value;
  if (!day || !DATE_KEY_PATTERN.test(day)) return;
  recordingContract.value = true;
  try {
    await enrollmentsApi.recordContract(entry.id, day);
    success("Contract consemnat", `Semnat la ${formatDate(day)}.`);
    history.value = (await enrollmentsApi.fetchHistory(Number(route.params.childId))) ?? [];
  } catch (err: unknown) {
    notifyError("Nu am putut consemna contractul", apiErrorMessage(err));
  } finally {
    recordingContract.value = false;
  }
};

/** The enrolment still running, if any. Only one can be, by D6. */
const inForce = computed(() => history.value.find((entry) => entry.endDate === null));

/** Every other active group — a transfer into the group the child is already in is refused anyway. */
const transferOptions = computed(() =>
  groupsStore.groups
    .filter((group) => group.isActive && group.id !== inForce.value?.group?.id)
    .map((group) => ({ label: group.name, value: group.id }))
);

const formatDate = (value: string) => new Intl.DateTimeFormat("ro-RO").format(new Date(value));

/** "din 10.01.2026" while it runs, "10.01.2026 – 31.03.2026" once it is history. */
const periodOf = (entry: Enrollment) =>
  entry.endDate === null
    ? `din ${formatDate(entry.startDate)}`
    : `${formatDate(entry.startDate)} – ${formatDate(entry.endDate)}`;

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Editare copil",
});

const schema = z.object({
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  // Required, because the column is `NOT NULL`: an emptied field used to pass as "optional", drop
  // out of the payload, and report success while the server kept the old date.
  birthDate: z
    .string({ error: "Data nașterii este obligatorie" })
    .regex(DATE_KEY_PATTERN, "Data nașterii nu este validă")
    .refine((value) => value <= today, "Data nașterii nu poate fi în viitor"),
});

type Schema = z.output<typeof schema>;

const state = reactive<{
  id: number;
  firstName: string;
  lastName: string;
  birthDate?: string;
  createdAt: string;
}>({
  id: 0,
  firstName: "",
  lastName: "",
  birthDate: undefined,
  createdAt: "",
});

onMounted(async () => {
  await childrenApi.fetchChildren();
  const childId = route.params.childId;
  const child: Child | undefined = childrenStore.getChildById(childId as string);
  if (child) {
    state.id = child.id;
    state.firstName = child.firstName;
    state.lastName = child.lastName;
    state.birthDate = child.birthDate;
    state.createdAt = child.createdAt;
  }

  try {
    await groupsApi.fetchGroups();
  } catch {
    // The transfer control simply has nothing to offer; the history below still loads.
  }

  try {
    history.value = (await enrollmentsApi.fetchHistory(Number(childId))) ?? [];
  } catch {
    // The form above is the point of this page; a history that failed to load should not stop it
    // from being usable.
    history.value = [];
  } finally {
    historyLoading.value = false;
  }
});

async function handleTransfer() {
  if (!transferTargetId.value) return;
  transferring.value = true;
  try {
    await enrollmentsApi.transfer({
      childId: Number(route.params.childId),
      toGroupId: transferTargetId.value,
    });
    success("Copilul a fost transferat");
    transferTargetId.value = undefined;
    history.value = (await enrollmentsApi.fetchHistory(Number(route.params.childId))) ?? [];
  } catch (err) {
    // A full group, an age outside the band, an inactive group — the server names each, and
    // `useApiError` has the Romanian sentence.
    notifyError("Transferul nu s-a putut face", apiErrorMessage(err));
  } finally {
    transferring.value = false;
  }
}

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  const childId = Number(route.params.childId);
  saving.value = true;
  try {
    // `createdAt` stays out of the payload: it cannot be edited. The birth date is already the
    // `YYYY-MM-DD` the API takes — `AdminDateField` keeps it that way.
    await childrenApi.updateChild(childId, {
      firstName: normalizeName(event.data.firstName),
      lastName: normalizeName(event.data.lastName),
      birthDate: event.data.birthDate,
    });
    success("Copilul a fost actualizat cu succes");
    await navigateTo("/admin/children");
  } catch (err) {
    notifyError("Copilul nu s-a putut salva", apiErrorMessage(err));
  } finally {
    saving.value = false;
  }
}
</script>
