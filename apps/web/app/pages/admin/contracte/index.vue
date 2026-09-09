<template>
  <AdminPage
    title="Contracte nesemnate"
    subtitle="Înscrieri active pentru care nu e consemnat niciun contract semnat. Contractul e pe hârtie, în dosar; aici se reține doar că există și din ce zi."
  >
    <template #actions>
      <UBadge color="warning" variant="subtle" size="lg" class="min-h-11 flex items-center px-4">
        {{ rows.length }} {{ rows.length === 1 ? "înscriere" : "înscrieri" }} fără contract
      </UBadge>
    </template>

    <AdminError v-if="loadError" :message="loadError" @retry="load" />
    <AdminLoading v-else-if="loading" />

    <UCard v-else-if="rows.length === 0" class="border" variant="subtle">
      <div class="py-8 text-center space-y-2">
        <UIcon name="i-lucide-check-circle" class="text-3xl text-success" />
        <p class="font-medium">Toate înscrierile active au contract consemnat.</p>
        <p class="text-muted text-sm">
          O înscriere nouă fără dată de semnare apare aici imediat. Probele nu apar: proba e
          gratuită și n-are contract.
        </p>
      </div>
    </UCard>

    <UCard v-for="row in rows" v-else :key="row.id" class="border">
      <div class="flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-1 space-y-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-lg">
              {{ row.child?.firstName }} {{ row.child?.lastName }}
            </span>
            <UBadge color="neutral" variant="subtle" size="sm">{{ row.group?.name }}</UBadge>
          </div>
          <p class="text-sm text-muted">
            Înscris din {{ formatDateKey(row.startDate) }}
            <template v-if="row.child?.parent">
              · {{ row.child.parent.firstName }} {{ row.child.parent.lastName }}
              <template v-if="row.child.parent.phone"> · {{ row.child.parent.phone }}</template>
            </template>
          </p>
        </div>
        <div class="flex items-end gap-2 shrink-0">
          <UFormField label="Semnat la" :name="`signed-${row.id}`">
            <AdminDateField
              v-model="signedOn[row.id]"
              :max="today"
              :label="`data semnării pentru ${row.child?.firstName} ${row.child?.lastName}`"
            />
          </UFormField>
          <UButton
            color="primary"
            class="min-h-11"
            :loading="busyId === row.id"
            :disabled="busyId !== null || !isDateKey(signedOn[row.id])"
            @click="record(row)"
          >
            Consemnează
          </UButton>
        </div>
      </div>
    </UCard>

    <p v-if="rows.length > 0" class="text-xs text-muted">
      Data e cea de pe hârtie, nu cea de azi. Platforma nu ține textul contractului și nu capturează
      nicio acceptare — copia i-o dă școala familiei, din dosar.
    </p>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useEnrollmentsApi } from "~/composables/api/useEnrollmentsApi";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey } from "~/composables/useAdminFormat";
import { DATE_KEY_PATTERN } from "~/composables/useDateField";
import { todayKey } from "~/composables/useAttendanceCalendar";
import type { Enrollment } from "~/types/enrollment.types";

/**
 * The list E07/S8 asks for: "a semnat familia X?" answered from the platform, not from a binder.
 *
 * One row per active enrolment with nothing on file, and one field per row — the day on the
 * paper. Nothing else is captured, by decision: the contract is signed in the room, the folder
 * keeps the text, and the platform keeps the fact. The same day can be entered at enrolment and at
 * trial confirmation; this is the door for every row where nobody typed it then.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Contracte nesemnate",
});

const { fetchWithoutContract, recordContract } = useEnrollmentsApi();
const { success, error: notifyError } = useNotifications();

const rows = ref<Enrollment[]>([]);
const loading = ref(true);
const loadError = ref("");
const busyId = ref<number | null>(null);
/** The day typed per row. Defaults to today: most contracts are recorded the day they are signed. */
const signedOn = reactive<Record<number, string | undefined>>({});
const today = todayKey();

const isDateKey = (value: string | undefined) =>
  value !== undefined && DATE_KEY_PATTERN.test(value);

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    rows.value = (await fetchWithoutContract()) ?? [];
    for (const row of rows.value) {
      signedOn[row.id] ??= today;
    }
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca lista.");
  } finally {
    loading.value = false;
  }
};

const record = async (row: Enrollment) => {
  const day = signedOn[row.id];
  if (!isDateKey(day)) return;
  busyId.value = row.id;
  try {
    await recordContract(row.id, day!);
    success(
      "Contract consemnat",
      `${row.child?.firstName} ${row.child?.lastName} · ${formatDateKey(day!)}`
    );
    await load();
  } catch (err: unknown) {
    notifyError("Nu am putut consemna contractul", apiErrorMessage(err));
  } finally {
    busyId.value = null;
  }
};

onMounted(load);
</script>
