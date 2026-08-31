<template>
  <AdminPage
    title="Calendar școlar"
    subtitle="Vacanțele și zilele libere. Generatorul de orar sare peste zilele de aici, iar ședințele deja programate în interval se anulează când adaugi intervalul."
  >
    <UCard>
      <template #header>
        <h2 class="text-xl font-semibold">Adaugă un interval</h2>
      </template>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UFormField label="Denumire" required>
            <UInput v-model="draft.name" placeholder="Vacanța de iarnă" class="w-full" />
          </UFormField>
          <UFormField label="Locație">
            <USelect v-model="draft.locationId" :items="locationItems" class="w-full" />
          </UFormField>
          <UFormField label="Prima zi" required>
            <UInput v-model="draft.startDate" type="date" class="w-full" />
          </UFormField>
          <UFormField
            label="Ultima zi"
            required
            help="Inclusiv. Pentru o singură zi, pune aceeași dată."
          >
            <UInput v-model="draft.endDate" type="date" class="w-full" />
          </UFormField>
        </div>

        <!-- The safety net: what this would cancel, before it cancels it. -->
        <div v-if="datesReversed" class="flex items-start gap-2 text-sm text-error">
          <UIcon name="i-lucide-alert-triangle" class="mt-0.5 shrink-0" />
          <span>Ultima zi este înaintea primei zile.</span>
        </div>

        <div
          v-else-if="rangeChosen"
          class="border border-muted rounded-lg p-4 space-y-3"
          :class="impact?.affected.length ? 'bg-warning/5' : ''"
        >
          <div class="flex items-center gap-2">
            <UIcon
              :name="impactLoading ? 'i-lucide-loader-circle' : impactIcon"
              class="shrink-0"
              :class="impactLoading && 'animate-spin'"
            />
            <p class="text-sm font-medium">{{ impactSummary }}</p>
          </div>

          <ul v-if="impact?.byGroup.length" class="space-y-1 text-sm text-muted">
            <li v-for="group in impact.byGroup" :key="group.groupId">
              <span class="font-medium text-default">{{ group.groupName }}</span>
              pierde {{ group.count }} {{ group.count === 1 ? "ședință" : "ședințe" }} —
              <span class="tabular-nums">{{ group.dates.map(shortDate).join(", ") }}</span>
            </li>
          </ul>
        </div>

        <div class="flex items-center gap-3">
          <UButton type="submit" color="primary" :loading="saving" :disabled="!canSubmit">
            Adaugă intervalul
          </UButton>
          <p v-if="impact?.affected.length" class="text-sm text-muted">
            Ședințele se anulează, nu se șterg.
          </p>
        </div>
      </form>
    </UCard>

    <AdminLoading v-if="loading" />

    <AdminEmpty
      v-else-if="periods.length === 0"
      icon="i-lucide-calendar-off"
      title="Niciun interval încă"
      description="Orarul se generează pe toate săptămânile până nu există unul."
    />

    <div v-else class="space-y-6">
      <section v-for="year in years" :key="year.label" class="space-y-3">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wide">{{ year.label }}</h2>
        <div class="space-y-2">
          <AdminListRow
            v-for="period in year.periods"
            :key="period.id"
            :title="period.name"
            :subtitle="rangeLabel(period)"
            :dimmed="isPast(period)"
          >
            <template #badges>
              <UBadge v-if="period.location" color="neutral" variant="soft" size="sm">
                {{ period.location.name }}
              </UBadge>
              <UBadge v-if="isPast(period)" color="neutral" variant="subtle" size="sm">
                Trecut
              </UBadge>
            </template>
            <template #actions>
              <UButton
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash-2"
                :aria-label="`Șterge ${period.name}`"
                @click="askDelete(period)"
              />
            </template>
          </AdminListRow>
        </div>
      </section>
    </div>

    <AdminConfirmModal
      v-model:open="deleteOpen"
      :title="`Ștergi „${toDelete?.name}\u201d?`"
      confirm-label="Șterge intervalul"
      danger
      :loading="deleting"
      @confirm="handleDelete"
    >
      <template #body>
        <p class="text-sm">
          Ședințele pe care le-a anulat rămân anulate — reactivarea se face per ședință, din orarul
          grupei.
        </p>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useNotifications } from "~/composables/useNotifications";
import { useLocationStore } from "~/stores/locationStore";
import type { NonTeachingImpact, NonTeachingPeriod } from "~/types/class-session.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Calendar școlar",
});

const { success, error } = useNotifications();
const classSessionsApi = useClassSessionsApi();
const locationsApi = useLocationsApi();
const locationStore = useLocationStore();

const periods = ref<NonTeachingPeriod[]>([]);
const loading = ref(true);
const saving = ref(false);

const draft = reactive({
  name: "",
  startDate: "",
  endDate: "",
  locationId: null as number | null,
});

const locationItems = computed(() => [
  { value: null, label: "Toată școala" },
  ...locationStore.locations.map((location) => ({ value: location.id, label: location.name })),
]);

const rangeChosen = computed(() => Boolean(draft.startDate && draft.endDate));
const datesReversed = computed(() => rangeChosen.value && draft.endDate < draft.startDate);
const canSubmit = computed(
  () => Boolean(draft.name.trim()) && rangeChosen.value && !datesReversed.value && !saving.value
);

// --- The impact preview ---------------------------------------------------------------------
//
// Asked on every change to the dates or the location, because a mistyped year is the failure this
// screen exists to prevent: 2027 instead of 2026 empties a term, and without this it would show up
// as classes quietly missing from January.

const impact = ref<NonTeachingImpact | null>(null);
const impactLoading = ref(false);

/**
 * The request in flight. A slow answer for a half-typed date must not overwrite the answer for the
 * date the admin has since finished typing — `type="date"` fires as each part is filled in, so out
 * of order is the normal case here, not the rare one.
 */
let impactToken = 0;

const refreshImpact = async () => {
  if (!rangeChosen.value || datesReversed.value) {
    impact.value = null;
    return;
  }

  const token = ++impactToken;
  impactLoading.value = true;
  try {
    const result = await classSessionsApi.fetchNonTeachingImpact({
      startDate: draft.startDate,
      endDate: draft.endDate,
      locationId: draft.locationId,
    });
    if (token === impactToken) impact.value = result;
  } catch {
    // A failed preview is not worth a toast: the dates are still being typed, and the button
    // below is the thing that must report a real failure.
    if (token === impactToken) impact.value = null;
  } finally {
    if (token === impactToken) impactLoading.value = false;
  }
};

watch(() => [draft.startDate, draft.endDate, draft.locationId], refreshImpact);

const impactIcon = computed(() =>
  impact.value?.affected.length ? "i-lucide-alert-triangle" : "i-lucide-check"
);

const impactSummary = computed(() => {
  if (impactLoading.value) return "Se verifică orarul…";
  const count = impact.value?.affected.length ?? 0;
  if (count === 0) return "Nicio ședință programată în acest interval.";
  const groups = impact.value?.byGroup.length ?? 0;
  return `Se anulează ${count} ${count === 1 ? "ședință" : "ședințe"} din ${groups} ${
    groups === 1 ? "grupă" : "grupe"
  }.`;
});

// --- The list -------------------------------------------------------------------------------

const load = async () => {
  loading.value = true;
  try {
    periods.value = await classSessionsApi.fetchNonTeachingPeriods();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la încărcarea calendarului"));
  } finally {
    loading.value = false;
  }
};

onMounted(async () => {
  await Promise.all([
    load(),
    locationsApi.fetchLocations().catch(() => {
      // The location select falls back to "toată școala", which is every period so far anyway.
    }),
  ]);
});

/** School years, not calendar ones: a winter holiday belongs with the September that opened it. */
const schoolYearOf = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return (month ?? 1) >= 9 ? (year ?? 0) : (year ?? 0) - 1;
};

const years = computed(() => {
  const buckets = new Map<number, NonTeachingPeriod[]>();
  for (const period of periods.value) {
    const year = schoolYearOf(period.startDate);
    buckets.set(year, [...(buckets.get(year) ?? []), period]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, entries]) => ({ label: `Anul școlar ${year}–${year + 1}`, periods: entries }));
});

const today = new Date().toISOString().slice(0, 10);
const isPast = (period: NonTeachingPeriod) => period.endDate < today;

const MONTHS = [
  "ian.",
  "feb.",
  "mar.",
  "apr.",
  "mai",
  "iun.",
  "iul.",
  "aug.",
  "sept.",
  "oct.",
  "nov.",
  "dec.",
];

/** "21 dec." — no year, because the heading above already says which school year this is. */
const shortDate = (date: string) => {
  const [, month, day] = date.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}`;
};

const rangeLabel = (period: NonTeachingPeriod) => {
  const days = dayCount(period);
  const span =
    period.startDate === period.endDate
      ? `${shortDate(period.startDate)} ${period.startDate.slice(0, 4)}`
      : `${shortDate(period.startDate)} – ${shortDate(period.endDate)} ${period.endDate.slice(0, 4)}`;
  return `${span} · ${days} ${days === 1 ? "zi" : "zile"}`;
};

const dayCount = (period: NonTeachingPeriod) => {
  const start = Date.parse(`${period.startDate}T00:00:00Z`);
  const end = Date.parse(`${period.endDate}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000) + 1;
};

// --- Writing --------------------------------------------------------------------------------

const handleSubmit = async () => {
  if (!canSubmit.value) return;
  saving.value = true;
  try {
    const result = await classSessionsApi.createNonTeachingPeriod({
      name: draft.name.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      locationId: draft.locationId,
    });
    success(
      result.cancelled === 0
        ? `„${result.period.name}" a fost adăugat.`
        : `„${result.period.name}" a fost adăugat. S-au anulat ${result.cancelled} ${
            result.cancelled === 1 ? "ședință" : "ședințe"
          }.`
    );
    draft.name = "";
    draft.startDate = "";
    draft.endDate = "";
    draft.locationId = null;
    impact.value = null;
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la adăugarea intervalului"));
  } finally {
    saving.value = false;
  }
};

// Worth confirming: the sessions the period cancelled do not come back, and that is not obvious
// from a bin icon. The modal can say so; the browser `confirm()` it replaces could only shout.
const deleteOpen = ref(false);
const deleting = ref(false);
const toDelete = ref<NonTeachingPeriod | null>(null);

const askDelete = (period: NonTeachingPeriod) => {
  toDelete.value = period;
  deleteOpen.value = true;
};

const handleDelete = async () => {
  if (!toDelete.value) return;
  deleting.value = true;
  try {
    const result = await classSessionsApi.deleteNonTeachingPeriod(toDelete.value.id);
    success(result.message);
    deleteOpen.value = false;
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la ștergerea intervalului"));
  } finally {
    deleting.value = false;
  }
};
</script>
