<template>
  <UCard variant="subtle" class="max-w-2xl mx-auto">
    <template #header>
      <h1 class="text-2xl font-bold">Editare Copil</h1>
    </template>

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
        <template #label>Data Nașterii</template>
        <UInputDate ref="inputDate" v-model="state.birthDate">
          <template #trailing>
            <UPopover :reference="inputDate?.inputsRef?.[3]?.$el">
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                icon="i-lucide-calendar"
                aria-label="Select a date"
                class="px-0"
              />

              <template #content>
                <UCalendar v-model="state.birthDate" class="p-2" />
              </template>
            </UPopover>
          </template>
        </UInputDate>
      </UFormField>

      <div class="flex gap-3 pt-2">
        <UButton type="submit" size="lg" class="flex-1 justify-center" variant="solid"
          >Salvează Modificări</UButton
        >
        <UButton
          type="button"
          variant="subtle"
          size="lg"
          class="flex-1 justify-center"
          @click="handleCancel"
          >Anulează</UButton
        >
      </div>
    </UForm>
  </UCard>

  <!--
    E11/S1. The history is the answer to "which group was this child in last October" — the question
    the old single foreign key on `Child` could not answer at all, and the one that comes up when a
    family disputes an invoice.
  -->
  <UCard variant="subtle" class="max-w-2xl mx-auto mt-6">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-history" class="text-primary" />
        <h2 class="text-xl font-bold">Istoricul înscrierilor</h2>
      </div>
    </template>

    <div v-if="historyLoading" class="py-6 text-center text-muted">Se încarcă…</div>

    <div v-else-if="history.length === 0" class="py-6 text-center">
      <p class="text-muted">Copilul nu a fost înscris în nicio grupă.</p>
    </div>

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
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { Child } from "~/types/child.types";
import { useChildrenStore } from "~/stores/childrenStore";
import { parseDate } from "@internationalized/date";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useNotifications } from "~/composables/useNotifications";
import { normalizeName } from "~/composables/useUtils";
import { useEnrollmentsApi } from "~/composables/api/useEnrollmentsApi";
import type { Enrollment } from "~/types/enrollment.types";
import { ENROLLMENT_STATUS_LABELS } from "~/types/enrollment.types";

const route = useRoute();
const inputDate = ref();
const childrenStore = useChildrenStore();
const childrenApi = useChildrenApi();
const enrollmentsApi = useEnrollmentsApi();

const { success } = useNotifications();

const history = ref<Enrollment[]>([]);
const historyLoading = ref(true);

const formatDate = (value: string) => new Intl.DateTimeFormat("ro-RO").format(new Date(value));

/** "din 10.01.2026" while it runs, "10.01.2026 – 31.03.2026" once it is history. */
const periodOf = (entry: Enrollment) =>
  entry.endDate === null
    ? `din ${formatDate(entry.startDate)}`
    : `${formatDate(entry.startDate)} – ${formatDate(entry.endDate)}`;

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Editare Copil",
});

const schema = z.object({
  firstName: z.string().min(1, "Prenumele este obligatoriu"),
  lastName: z.string().min(1, "Numele este obligatoriu"),
  birthDate: z.any().optional(),
});

type Schema = z.output<typeof schema>;

const state = reactive<{
  id: number;
  firstName: string;
  lastName: string;
  birthDate?: any;
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
    state.birthDate = parseDate(child.birthDate);
    state.createdAt = child.createdAt;
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

async function handleSubmit(event: FormSubmitEvent<Schema>) {
  const childId = Number(route.params.childId);
  // Prepare payload without createdAt (cannot be edited)
  const birthDate = event.data.birthDate;
  const formattedDate =
    birthDate instanceof Date ? birthDate.toISOString().split("T")[0] : birthDate?.toString?.();

  const payload = {
    firstName: normalizeName(event.data.firstName),
    lastName: normalizeName(event.data.lastName),
    birthDate: formattedDate,
  };

  await childrenApi.updateChild(childId, payload);
  success("Copilul a fost actualizat cu succes");

  await navigateTo("/admin/children");
}

function handleCancel() {
  navigateTo("/admin/children");
}
</script>
