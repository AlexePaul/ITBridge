<template>
  <AdminPage
    title="Acorduri pentru lucrări"
    subtitle="Copiii ale căror lucrări se pot folosi azi în materialele școlii — pe site, pe paginile din rețelele sociale, în prezentări. Uită-te aici înainte să alegi o lucrare: site-ul nu citește din platformă, deci verificarea e asta."
  >
    <template #actions>
      <UBadge color="primary" variant="subtle" size="lg" class="min-h-11 flex items-center px-4">
        {{ rows.length }} {{ rows.length === 1 ? "copil" : "copii" }} cu acord
      </UBadge>
    </template>

    <AdminError v-if="loadError" :message="loadError" @retry="load" />
    <AdminLoading v-else-if="loading" />

    <UCard v-else-if="rows.length === 0" class="border" variant="subtle">
      <div class="py-8 text-center space-y-2">
        <UIcon name="i-lucide-image-off" class="text-3xl text-muted" />
        <p class="font-medium">Deocamdată nicio familie n-a dat acordul.</p>
        <p class="text-muted text-sm">
          Fără acord, lucrarea unui copil nu apare nicăieri în afara portalului familiei lui.
          Familia îl dă din portal; unul semnat pe hârtie îl consemnezi din pagina familiei.
        </p>
      </div>
    </UCard>

    <UCard v-for="row in rows" v-else :key="row.consentId" class="border">
      <div class="flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-1 space-y-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-semibold text-lg">
              {{ row.child.firstName }} {{ row.child.lastName }}
            </span>
            <UBadge v-if="row.group" color="neutral" variant="subtle" size="sm">
              {{ row.group.name }}
            </UBadge>
          </div>
          <p class="text-sm text-muted">
            Acord din {{ onDay(row.grantedAt) }}, {{ CHANNEL_LABELS[row.grantedVia] }} · versiunea
            {{ row.textVersion }} · {{ row.family.firstName }} {{ row.family.lastName }}
          </p>
          <p class="text-sm">
            Lângă lucrare: <strong>{{ creditLine(row.child, today) }}</strong>
          </p>
        </div>
        <div class="flex gap-2 shrink-0">
          <UButton
            v-if="row.group"
            :to="`/admin/proiecte/grupa/${row.group.id}`"
            variant="subtle"
            class="min-h-11"
            :aria-label="`Lucrările grupei — ${row.child.firstName} ${row.child.lastName}`"
          >
            Lucrările grupei
          </UButton>
          <UButton
            :to="`/admin/profiles/${row.family.id}`"
            variant="ghost"
            class="min-h-11"
            :aria-label="`Familia — ${row.child.firstName} ${row.child.lastName}`"
          >
            Familia
          </UButton>
        </div>
      </div>
    </UCard>

    <p class="text-xs text-muted">
      Lângă o lucrare apar cel mult prenumele, inițiala și vârsta — nimic altceva, și niciodată o
      fotografie a copilului. Când o familie retrage acordul, primești un email cu ce trebuie scos.
      <NuxtLink to="/acord-lucrari" class="underline">Textul acordului</NuxtLink>
    </p>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { usePrivacyApi } from "~/composables/api/usePrivacyApi";
import { formatDateKey } from "~/composables/useAdminFormat";
import { dayKey } from "~/composables/useUtils";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { creditLine } from "~/composables/useConsent";
import { CHANNEL_LABELS } from "~/types/consent.types";
import type { ConsentInForce } from "~/types/consent.types";

/**
 * What the office may use, today — E07/S2.
 *
 * The epic's check happens "at the moment of display", and for this school that moment is a person
 * choosing a work for the site or for a post: the public site is static and does not read from the
 * platform, and the social pages are outside it. So the list is the check, read before the choice,
 * and a withdrawal reaches the office by email because nothing here can take a post down.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Acorduri pentru lucrări",
});

const { fetchConsentsInForce } = usePrivacyApi();

const rows = ref<ConsentInForce[]>([]);
const loading = ref(true);
const loadError = ref("");
const today = todayKey();

const onDay = (at: string) => formatDateKey(dayKey(new Date(at)));

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    rows.value = await fetchConsentsInForce("promotion");
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca lista.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>
