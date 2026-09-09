<template>
  <AdminPage
    title="Cereri de ștergere"
    subtitle="Familii care au cerut ștergerea contului. Termenul e de 30 de zile de la cerere. Facturile rămân — legea ne obligă să păstrăm evidența plăților; restul dispare."
  >
    <template #actions>
      <UBadge color="warning" variant="subtle" size="lg" class="min-h-11 flex items-center px-4">
        {{ rows.length }} {{ rows.length === 1 ? "cerere" : "cereri" }}
      </UBadge>
    </template>

    <AdminError v-if="loadError" :message="loadError" @retry="load" />
    <AdminLoading v-else-if="loading" />

    <UCard v-else-if="rows.length === 0" class="border" variant="subtle">
      <div class="py-8 text-center space-y-2">
        <UIcon name="i-lucide-check-circle" class="text-3xl text-success" />
        <p class="font-medium">Nicio cerere de ștergere.</p>
        <p class="text-muted text-sm">
          O familie cere ștergerea din portal, de pe pagina de profil. Cererea apare aici imediat.
        </p>
      </div>
    </UCard>

    <UCard v-for="row in rows" v-else :key="row.id" class="border">
      <div class="flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-1 space-y-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-lg">{{ row.firstName }} {{ row.lastName }}</span>
            <UBadge
              :color="daysWaiting(row) >= 30 ? 'error' : 'neutral'"
              variant="subtle"
              size="sm"
            >
              {{ daysWaiting(row) }} {{ daysWaiting(row) === 1 ? "zi" : "zile" }}
            </UBadge>
          </div>
          <p class="text-sm text-muted">
            A cerut pe {{ formatDateKey(String(row.erasureRequestedAt).slice(0, 10)) }}
            <template v-if="row.email"> · {{ row.email }}</template>
            <template v-if="row.phone"> · {{ row.phone }}</template>
          </p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <UButton
            color="error"
            class="min-h-11"
            :loading="busyId === row.id"
            :disabled="busyId !== null"
            :aria-label="eraseLabel(row)"
            @click="confirm(row)"
          >
            {{ confirmingId === row.id ? "Sigur? Apasă din nou" : "Șterge datele" }}
          </UButton>
        </div>
      </div>
    </UCard>

    <p v-if="rows.length > 0" class="text-xs text-muted">
      Ștergerea nu se poate anula. Dispar copiii, înscrierile, prezențele, proiectele, mesajele și
      contul; rămâne rândul familiei, golit, fiindcă facturile atârnă de el. Ce a rămas prin
      <NuxtLink to="/admin/proiecte" class="underline">fișierele neatribuite</NuxtLink> nu se poate
      lega de nicio familie, deci se curăță de acolo, de mână.
    </p>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { usePrivacyApi } from "~/composables/api/usePrivacyApi";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey } from "~/composables/useAdminFormat";
import type { ProfileSummary } from "~/types/profile.types";

/**
 * The office's side of E07/S4: the queue, and the one button that carries an erasure out.
 *
 * Two presses, like the request in the portal, and for a stronger reason — this one really deletes.
 * The arming press is per row (`confirmingId`), so arming one family and then pressing another does
 * not erase the second: the second press only counts on the row that armed.
 *
 * The badge turns red at thirty days because that is the term the law gives, not a house style.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Cereri de ștergere",
});

const { fetchPendingErasures, eraseProfile } = usePrivacyApi();
const { success, error: notifyError } = useNotifications();

const rows = ref<ProfileSummary[]>([]);
const loading = ref(true);
const loadError = ref("");
const busyId = ref<number | null>(null);
const confirmingId = ref<number | null>(null);

/**
 * The button's name, which has to move with its text.
 *
 * The label names the family, because twenty rows all called „Șterge datele" are twenty identical
 * entries in the list a screen reader navigates by — the sweep in E18/S6 found exactly that. But a
 * fixed label would break WCAG 2.5.3 the moment the button arms: the accessible name has to contain
 * the visible text, and the visible text changes to „Sigur?". So both halves move together.
 */
const eraseLabel = (row: ProfileSummary) =>
  confirmingId.value === row.id
    ? `Sigur? Apasă din nou pentru a șterge datele familiei ${row.firstName} ${row.lastName}`
    : `Șterge datele familiei ${row.firstName} ${row.lastName}`;

/** Calendar days, like E17/S8's document backlog: somebody counts mornings, not 24-hour blocks. */
const daysWaiting = (row: ProfileSummary) => {
  const requested = row.erasureRequestedAt;
  if (!requested) return 0;
  const from = new Date(String(requested).slice(0, 10));
  const today = new Date(new Date().toISOString().slice(0, 10));
  return Math.max(0, Math.round((today.getTime() - from.getTime()) / 86_400_000));
};

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    rows.value = (await fetchPendingErasures()) ?? [];
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca cererile.");
  } finally {
    loading.value = false;
  }
};

const confirm = async (row: ProfileSummary) => {
  if (confirmingId.value !== row.id) {
    confirmingId.value = row.id;
    return;
  }

  busyId.value = row.id;
  try {
    const report = await eraseProfile(row.id);
    success(
      "Datele au fost șterse",
      `${report.childrenRemoved} ${report.childrenRemoved === 1 ? "copil" : "copii"} · ${report.invoicesKept} ${report.invoicesKept === 1 ? "factură păstrată" : "facturi păstrate"}`
    );
    await load();
  } catch (err: unknown) {
    notifyError("Nu am putut șterge datele", apiErrorMessage(err));
  } finally {
    confirmingId.value = null;
    busyId.value = null;
  }
};

onMounted(load);
</script>
