<template>
  <AdminPage
    title="Formarea grupelor"
    subtitle='Copiii pe care nu i-a repartizat nimeni, grupați pe vârstă și locație. Răspunde la „am destui copii pentru o grupă nouă?" fără să compari două liste.'
  >
    <!-- Trials nobody has decided on. A trial holds a seat until somebody closes it, so this list
         is not only a commercial tool — it is what keeps the capacity figures honest. -->
    <UCard v-if="trials.length > 0" class="border border-warning" variant="subtle">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-hourglass" class="text-warning" />
          <h2 class="text-xl font-bold">Probe fără decizie</h2>
          <UBadge color="warning" variant="subtle">{{ trials.length }}</UBadge>
        </div>
      </template>

      <p class="text-sm text-muted mb-4">
        Fiecare dintre ele ține un loc ocupat. Confirmă sau închide, ca locul să fie real.
      </p>

      <div class="space-y-3">
        <div
          v-for="trial in trials"
          :key="trial.id"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border border-muted rounded-lg"
        >
          <div>
            <p class="font-semibold">
              {{ trial.child?.firstName }} {{ trial.child?.lastName }} ·
              {{ trial.group?.name }}
            </p>
            <p class="text-sm text-muted">Probă din {{ formatDate(trial.startDate) }}</p>
          </div>
          <div class="flex gap-2 shrink-0">
            <UButton
              color="primary"
              size="sm"
              :disabled="busyId !== null"
              :loading="busyId === trial.id"
              @click="resolve(trial, true)"
            >
              A rămas
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="busyId !== null"
              @click="openClose(trial)"
            >
              Nu continuă
            </UButton>
          </div>
        </div>
      </div>
    </UCard>

    <AdminConfirmModal
      v-model:open="closeOpen"
      title="Închide proba"
      confirm-label="Închide proba"
      :loading="closeSaving"
      @confirm="confirmClose"
    >
      <template #body>
        <p class="text-sm text-muted">
          Scrie de ce nu continuă {{ closing?.child?.firstName ?? "copilul" }}. Locul se eliberează
          și se oferă listei de așteptare, iar motivul rămâne pe cerere și în raportul pâlniei.
        </p>
        <UFormField label="Motiv" required :error="closeError" class="mt-3">
          <UInput
            v-model="closeReason"
            placeholder="ex. programul nu li se potrivește"
            class="w-full"
          />
        </UFormField>
      </template>
    </AdminConfirmModal>

    <AdminError v-if="loadError" :message="loadError" @retry="load" />

    <AdminLoading v-else-if="loading" />

    <AdminEmpty
      v-else-if="demand.length === 0"
      title="Toți copiii sunt repartizați."
      description="Aici apar copiii de pe listele de așteptare și cei care n-au primit încă o grupă."
      icon="i-lucide-check-circle"
    />

    <UCard
      v-for="bucket in demand"
      v-else
      :key="`${bucket.locationId}-${bucket.ageBand}`"
      class="border"
    >
      <template #header>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-users-round" class="text-primary" />
            <h2 class="text-xl font-bold">{{ bucket.ageBand }}</h2>
            <span class="text-muted">· {{ bucket.locationName }}</span>
          </div>
          <UBadge
            :color="bucket.children.length >= 6 ? 'success' : 'neutral'"
            variant="subtle"
            size="lg"
          >
            {{ countOf(bucket.children.length, "copil", "copii") }}
          </UBadge>
        </div>
      </template>

      <!-- Six is the number at which a group starts being worth running, not a rule the platform
           enforces — hence a hint, not a gate. -->
      <p v-if="bucket.children.length >= 6" class="text-sm text-success mb-3">
        Sunt destui pentru o grupă nouă.
      </p>

      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="child in bucket.children"
          :key="child.id"
          color="neutral"
          variant="subtle"
          size="lg"
        >
          {{ child.firstName }} {{ child.lastName }} · {{ child.age }} ani
        </UBadge>
      </div>
    </UCard>
  </AdminPage>
</template>

<script setup lang="ts">
import { countOf } from "~/composables/useRomanianCount";
import { onMounted, ref, watch } from "vue";
import { useEnrollmentsApi } from "~/composables/api/useEnrollmentsApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import type { DemandBucket, Enrollment } from "~/types/enrollment.types";

/**
 * E11/S7, minus the half that cannot be built yet.
 *
 * The epic also asks for teacher availability, which is E09 — there is no `TEACHER` role and no
 * availability to read. Free rooms live on `/admin/locations` and are not duplicated here. What is
 * here is the part that answers the question the epic quotes: where the unplaced children are.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Formarea grupelor",
});

const { fetchDemand, fetchUnresolvedTrials, resolveTrial } = useEnrollmentsApi();
const { success, error: notifyError } = useNotifications();

const demand = ref<DemandBucket[]>([]);
const trials = ref<Enrollment[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const busyId = ref<number | null>(null);

const formatDate = (value: string) => new Intl.DateTimeFormat("ro-RO").format(new Date(value));

const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    const [buckets, openTrials] = await Promise.all([fetchDemand(), fetchUnresolvedTrials()]);
    demand.value = buckets ?? [];
    trials.value = openTrials ?? [];
  } catch (err) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca cererea neacoperită.");
  } finally {
    loading.value = false;
  }
};

const resolve = async (trial: Enrollment, accepted: boolean) => {
  busyId.value = trial.id;
  try {
    await resolveTrial(trial.id, { accepted });
    success("Proba a devenit înscriere");
    await load();
  } catch (err) {
    notifyError("Nu am putut confirma proba", apiErrorMessage(err));
  } finally {
    busyId.value = null;
  }
};

/**
 * "Nu continuă" asks why, like the lead's own "Pierdut" (E20/S3, "no silent exit"). It closed the
 * trial in one tap and wrote a canned reason on the lead, so a slip of the thumb freed a family's
 * seat and the funnel learned nothing (QA of 27 September 2026). The reason is checked here, and a
 * refusal stays in the dialog.
 */
const closeOpen = ref(false);
const closeSaving = ref(false);
const closeReason = ref("");
const closeError = ref<string | undefined>(undefined);
const closing = ref<Enrollment | null>(null);
watch(closeReason, () => (closeError.value = undefined));

const openClose = (trial: Enrollment) => {
  closing.value = trial;
  closeReason.value = "";
  closeError.value = undefined;
  closeOpen.value = true;
};

const confirmClose = async () => {
  if (!closing.value) return;
  const reason = closeReason.value.trim();
  if (reason.length < 3) {
    closeError.value = "Scrie motivul în câteva cuvinte (cel puțin 3 caractere).";
    return;
  }
  closeSaving.value = true;
  try {
    await resolveTrial(closing.value.id, { accepted: false, reason });
    closeOpen.value = false;
    success("Proba a fost închisă, locul e liber");
    await load();
  } catch (err) {
    closeError.value = apiErrorMessage(err, "Nu am putut închide proba.");
  } finally {
    closeSaving.value = false;
  }
};

onMounted(load);
</script>
