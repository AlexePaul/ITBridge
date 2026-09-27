<template>
  <AdminPage
    title="Starea platformei"
    subtitle="Cum e configurat serverul, citit chiar de pe el: adresa din linkurile emailurilor, emailurile, SmartBill, contul pentru transfer, stocarea și schema bazei. Deschide pagina după fiecare schimbare în Parameter Store și înaintea unei zile de testare."
  >
    <template #actions>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="subtle"
        class="min-h-11"
        :loading="loading"
        @click="load"
      >
        Citește din nou
      </UButton>
    </template>

    <AdminLoading v-if="loading && !status" />
    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else-if="status">
      <section aria-labelledby="sistem-probleme" class="space-y-3">
        <h2 id="sistem-probleme" class="text-lg font-semibold">
          {{
            problems.length === 0
              ? "Nicio problemă"
              : countOf(problems.length, "problemă", "probleme")
          }}
        </h2>
        <p v-if="problems.length === 0" class="text-sm text-muted">
          Nimic din configurație nu stă în calea unei familii sau a biroului.
        </p>
        <div v-for="note in problems" :key="note.code" class="border-l-4 border-error pl-4 py-2">
          <p class="font-medium">{{ SYSTEM_NOTE_TEXT[note.code](status).title }}</p>
          <p class="text-sm mt-1">{{ SYSTEM_NOTE_TEXT[note.code](status).detail }}</p>
        </div>
      </section>

      <section v-if="notices.length" aria-labelledby="sistem-de-stiut" class="space-y-3">
        <h2 id="sistem-de-stiut" class="text-lg font-semibold">De știut</h2>
        <div v-for="note in notices" :key="note.code" class="border-l-4 border-default pl-4 py-2">
          <p class="font-medium">{{ SYSTEM_NOTE_TEXT[note.code](status).title }}</p>
          <p class="text-sm text-muted mt-1">{{ SYSTEM_NOTE_TEXT[note.code](status).detail }}</p>
        </div>
      </section>

      <section aria-labelledby="sistem-configuratie" class="space-y-3">
        <h2 id="sistem-configuratie" class="text-lg font-semibold">Configurația</h2>
        <dl class="divide-y divide-default border border-default rounded-lg">
          <div
            v-for="row in rows"
            :key="row.label"
            class="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-4 px-4 py-3"
          >
            <dt class="text-sm text-muted">{{ row.label }}</dt>
            <dd class="sm:col-span-2 text-sm break-words">
              <span :class="row.mono ? 'font-mono' : ''">{{ row.value }}</span>
            </dd>
          </div>
        </dl>
        <p class="text-xs text-muted">
          Cheile — email, SmartBill, stocare — apar doar ca „setate” sau nu; valorile lor nu pleacă
          de pe server.
        </p>
      </section>
    </template>
  </AdminPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useSystemApi } from "~/composables/api/useSystemApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { countOf } from "~/composables/useRomanianCount";
import { SYSTEM_NOTE_TEXT, environmentLabel } from "~/types/system.types";
import type { SystemStatus } from "~/types/system.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Starea platformei",
});

const systemApi = useSystemApi();

const loading = ref(true);
const loadError = ref("");
const status = ref<SystemStatus | null>(null);

const problems = computed(
  () => status.value?.notes.filter((note) => note.level === "problem") ?? []
);
const notices = computed(() => status.value?.notes.filter((note) => note.level === "notice") ?? []);

const SMARTBILL_LABELS: Record<SystemStatus["smartBillMode"], string> = {
  off: "oprit — PDF-ul platformei",
  draft: "ciorne",
  live: "facturi fiscale reale",
};

/** `2 zile, 3 ore` — how long the process has been up, which is how long since the last deploy. */
const uptimeLabel = (seconds: number): string => {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${countOf(days, "zi", "zile")}, ${countOf(hours, "oră", "ore")}`;
  if (hours > 0) return `${countOf(hours, "oră", "ore")}, ${countOf(minutes, "minut", "minute")}`;
  return countOf(minutes, "minut", "minute");
};

const rows = computed(() => {
  const current = status.value;
  if (!current) return [];
  const mail = current.mail;
  return [
    { label: "Mediul", value: environmentLabel(current.environment), mono: false },
    { label: "Ora școlii", value: current.schoolTime.replace("T", ", ora "), mono: false },
    {
      label: "Adresa din linkurile emailurilor",
      value: current.siteUrlConfigured
        ? current.siteUrl
        : `${current.siteUrl} (implicită: SITE_URL nu e setat)`,
      mono: true,
    },
    {
      label: "Emailuri",
      value: !mail.sending
        ? "oprite — se citesc în Livrări"
        : mail.providerConfigured
          ? `pleacă, de la ${mail.from}`
          : "se scriu, dar nu pleacă: lipsește cheia",
      mono: false,
    },
    { label: "Adresa biroului", value: mail.officeAddress, mono: true },
    { label: "SmartBill", value: SMARTBILL_LABELS[current.smartBillMode], mono: false },
    {
      label: "Contul pentru transfer",
      value: current.transferDetails ? "setat" : "nesetat — familiile plătesc la birou",
      mono: false,
    },
    {
      label: "Stocarea",
      value: `${current.storage.bucket ?? "nesetată"} — ${current.storage.reachable ? "răspunde" : "nu răspunde"}`,
      mono: false,
    },
    {
      label: "Schema bazei",
      value: `${countOf(current.migrations.applied, "migrare", "migrări")}, ultima ${current.migrations.last ?? "—"}${
        current.migrations.pending.length
          ? `; ${countOf(current.migrations.pending.length, "nerulată", "nerulate")}`
          : ""
      }`,
      mono: false,
    },
    {
      label: "Documentația API (Swagger)",
      value: current.swagger ? "pornită, la /api" : "oprită",
      mono: false,
    },
    {
      label: "Procesul",
      value: `Node ${current.nodeVersion}, pornit de ${uptimeLabel(current.uptimeSeconds)}`,
      mono: false,
    },
  ];
});

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    status.value = await systemApi.fetchSystemStatus();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut citi starea platformei.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>
