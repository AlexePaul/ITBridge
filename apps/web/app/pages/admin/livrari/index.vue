<template>
  <AdminPage
    title="Livrări"
    subtitle="Ce a plecat, ce n-a plecat și de ce. Răspunde la „a primit părintele anunțul?” — inclusiv pentru mesajele care n-au avut unde să plece."
    width="xl"
  >
    <!-- The header numbers: every state present, even at zero. -->
    <div v-if="summary" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <button
        v-for="state in states"
        :key="state"
        type="button"
        class="border border-muted rounded-lg p-4 text-left hover:bg-muted transition-colors"
        :class="filter.status === state && 'border-primary'"
        @click="toggleStatus(state)"
      >
        <p class="text-2xl font-semibold tabular-nums">{{ summary[state] }}</p>
        <p class="text-sm text-muted">{{ DELIVERY_STATUS_LABELS[state] }}</p>
      </button>
    </div>

    <form class="flex flex-wrap items-end gap-3" @submit.prevent="load">
      <UFormField label="Destinatar" class="w-56">
        <UInput v-model="filter.to" placeholder="nume sau adresă" class="w-full" />
      </UFormField>
      <UFormField label="De la" class="w-40">
        <UInput v-model="filter.from" type="date" class="w-full" />
      </UFormField>
      <UFormField label="Până la" class="w-40">
        <UInput v-model="filter.until" type="date" class="w-full" />
      </UFormField>
      <UButton type="submit" variant="subtle" :loading="loading">Caută</UButton>
      <UButton v-if="anyFilter" variant="ghost" color="neutral" @click="clearFilters">
        Curăță
      </UButton>
    </form>

    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />

    <AdminEmpty
      v-else-if="records.length === 0"
      icon="i-lucide-mail-x"
      title="Niciun mesaj"
      :description="anyFilter ? 'Nimic pentru filtrele astea.' : 'Coada e goală.'"
    />

    <div v-else class="space-y-2">
      <div v-for="record in records" :key="record.id" class="border border-muted rounded-lg p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-medium">{{ record.subject }}</p>
            <p class="text-muted text-sm mt-0.5">
              <span v-if="record.to">{{ record.to }}</span>
              <span v-else class="italic">fără destinatar</span>
              · <span class="tabular-nums">{{ formatDateKey(record.createdAt) }}</span>
              <span v-if="record.attempts > 0"> · {{ record.attempts }} încercări</span>
            </p>
          </div>
          <UBadge
            :color="DELIVERY_STATUS_COLORS[record.status]"
            variant="subtle"
            size="sm"
            class="shrink-0"
          >
            {{ DELIVERY_STATUS_LABELS[record.status] }}
          </UBadge>
        </div>

        <!-- The two reasons look the same in a list and are fixed differently; the screen says which. -->
        <div
          v-if="record.undeliverableReason"
          class="mt-3 text-sm border-l-2 border-warning pl-3 space-y-0.5"
        >
          <p class="font-medium">
            {{ UNDELIVERABLE_REASON_LABELS[record.undeliverableReason] }}
          </p>
          <p class="text-muted">
            {{ UNDELIVERABLE_REASON_ACTIONS[record.undeliverableReason] }}
          </p>
        </div>

        <p v-if="record.lastError" class="mt-3 text-sm text-error">{{ record.lastError }}</p>

        <UButton
          variant="ghost"
          size="xs"
          class="mt-2"
          @click="expanded === record.id ? (expanded = null) : (expanded = record.id)"
        >
          {{ expanded === record.id ? "Ascunde mesajul" : "Vezi mesajul" }}
        </UButton>
        <pre
          v-if="expanded === record.id"
          class="mt-2 text-sm whitespace-pre-wrap font-sans text-muted"
          >{{ record.bodyText }}</pre>
      </div>
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useDeliveriesApi } from "~/composables/api/useDeliveriesApi";
import { formatDateKey } from "~/composables/useAdminFormat";
import type { DeliveryRecord, DeliveryStatus, DeliverySummary } from "~/types/delivery.types";
import {
  DELIVERY_STATUS_COLORS,
  DELIVERY_STATUS_LABELS,
  UNDELIVERABLE_REASON_ACTIONS,
  UNDELIVERABLE_REASON_LABELS,
} from "~/types/delivery.types";

/**
 * The delivery record — E17/S5.
 *
 * Read-only on purpose: nothing here retries, deletes or edits. A human-triggered retry is a
 * different decision, because it has to answer "and what if it was already delivered?".
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Livrări",
});

const deliveriesApi = useDeliveriesApi();

const loading = ref(true);
const loadError = ref("");
const records = ref<DeliveryRecord[]>([]);
const summary = ref<DeliverySummary | null>(null);
const expanded = ref<number | null>(null);

/**
 * Every state, in the order an admin scans them. `digested` last: it is the least alarming — the
 * family did read what that row said, inside the combined message that replaced it (E17/S6).
 */
const states: DeliveryStatus[] = ["sent", "pending", "failed", "undeliverable", "digested"];

const filter = reactive<{ status?: DeliveryStatus; to: string; from: string; until: string }>({
  status: undefined,
  to: "",
  from: "",
  until: "",
});

const anyFilter = computed(
  () =>
    Boolean(filter.status) || Boolean(filter.to) || Boolean(filter.from) || Boolean(filter.until)
);

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const [list, counts] = await Promise.all([
      deliveriesApi.fetchDeliveries({
        status: filter.status,
        to: filter.to || undefined,
        from: filter.from || undefined,
        until: filter.until || undefined,
      }),
      deliveriesApi.fetchDeliverySummary(),
    ]);
    records.value = list;
    summary.value = counts;
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea livrărilor");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

/** Clicking the same card again clears the filter — the count stays a count, not a mode. */
const toggleStatus = (state: DeliveryStatus) => {
  filter.status = filter.status === state ? undefined : state;
  void load();
};

const clearFilters = () => {
  filter.status = undefined;
  filter.to = "";
  filter.from = "";
  filter.until = "";
  void load();
};
</script>
