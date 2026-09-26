<template>
  <UModal
    v-model:open="open"
    :title="lead ? `${lead.childFirstName} ${lead.childLastName}` : 'Cerere'"
    :description="lead ? `Cererea familiei ${lead.parentName}` : undefined"
  >
    <template #body>
      <div v-if="lead" class="space-y-5">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="LEAD_STATUS_COLORS[lead.status]" variant="subtle">
            {{ LEAD_STATUS_LABELS[lead.status] }}
          </UBadge>
          <UBadge color="neutral" variant="outline">{{ LEAD_SOURCE_LABELS[lead.source] }}</UBadge>
          <UBadge v-if="lead.noSeats" color="warning" variant="subtle">Fără loc liber</UBadge>
        </div>

        <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt class="text-muted">Familia</dt>
            <dd class="font-medium">{{ lead.parentName }}</dd>
          </div>
          <div>
            <dt class="text-muted">Copilul</dt>
            <dd>{{ formatDateKey(lead.childBirthDate) }} · {{ formatAge(lead.childBirthDate) }}</dd>
          </div>
          <div>
            <dt class="text-muted">Telefon</dt>
            <dd>
              <a v-if="lead.parentPhone" :href="`tel:${lead.parentPhone}`" class="underline">
                {{ lead.parentPhone }}
              </a>
              <span v-else class="text-muted">—</span>
            </dd>
          </div>
          <div>
            <dt class="text-muted">Email</dt>
            <dd class="break-all">
              <a v-if="lead.parentEmail" :href="`mailto:${lead.parentEmail}`" class="underline">
                {{ lead.parentEmail }}
              </a>
              <span v-else class="text-muted">—</span>
            </dd>
          </div>
          <div>
            <dt class="text-muted">Proba</dt>
            <dd>
              <template v-if="lead.trialSession">
                {{ lead.group?.name ?? "—" }} · {{ formatDateKey(lead.trialSession.date) }}, ora
                {{ lead.trialSession.startTime.slice(0, 5) }}
              </template>
              <template v-else-if="lead.group">{{ lead.group.name }}</template>
              <span v-else class="text-muted">Neprogramată</span>
            </dd>
          </div>
          <div>
            <dt class="text-muted">Unde ar veni</dt>
            <dd>{{ lead.location?.name ?? "Fără preferință" }}</dd>
          </div>
          <div v-if="lead.experience" class="sm:col-span-2">
            <dt class="text-muted">Ce a mai făcut copilul</dt>
            <dd>{{ lead.experience }}</dd>
          </div>
          <div v-if="lead.lostReason" class="sm:col-span-2">
            <dt class="text-muted">De ce nu continuă</dt>
            <dd>{{ lead.lostReason }}</dd>
          </div>
        </dl>

        <div class="flex flex-wrap items-center gap-3">
          <p class="text-sm">
            <span class="text-muted">Responsabil:</span>
            {{ lead.assignedTo?.username ?? "nimeni încă" }}
          </p>
          <UButton
            v-if="!lead.assignedTo || lead.assignedTo.id !== myId"
            size="sm"
            variant="outline"
            class="min-h-11"
            :loading="busy === 'claim'"
            @click="claim"
          >
            Preiau eu
          </UButton>
          <UButton
            v-if="lead.assignedTo"
            size="sm"
            variant="ghost"
            color="neutral"
            class="min-h-11"
            :loading="busy === 'release'"
            @click="release"
          >
            Eliberează
          </UButton>
        </div>

        <div v-if="!settled" class="space-y-3">
          <UFormField label="Note" name="notes">
            <UTextarea v-model="notes" :rows="3" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <UFormField label="Telefon" name="parentPhone">
              <UInput v-model="parentPhone" type="tel" class="w-full" />
            </UFormField>
            <UFormField label="Email" name="parentEmail">
              <UInput v-model="parentEmail" type="email" class="w-full" />
            </UFormField>
            <UFormField label="De unde a auzit de școală" name="channel">
              <USelect v-model="channel" :items="channelItems" class="w-full" />
            </UFormField>
            <UFormField label="Pasul următor" name="nextActionAt">
              <AdminDateField v-model="nextActionAt" label="ziua pasului următor" />
            </UFormField>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div v-if="lead" class="flex flex-wrap justify-between gap-2 w-full">
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="lead.status === 'new'"
            variant="outline"
            class="min-h-11"
            :loading="busy === 'contacted'"
            @click="contacted"
          >
            Am contactat familia
          </UButton>
          <UButton
            v-if="!settled"
            variant="outline"
            color="neutral"
            class="min-h-11"
            @click="emit('lose', lead)"
          >
            Pierdut…
          </UButton>
        </div>
        <UButton v-if="!settled" class="min-h-11" :loading="busy === 'save'" @click="save">
          Salvează
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLeadsApi } from "~/composables/api/useLeadsApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatAge, formatDateKey } from "~/composables/useAdminFormat";
import { useNotifications } from "~/composables/useNotifications";
import { useUserStore } from "~/stores/userStore";
import {
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_COLORS,
  LEAD_STATUS_LABELS,
} from "~/types/lead.types";
import type { LeadChannel, LeadSummary, UpdateLeadDto } from "~/types/lead.types";

/**
 * One family's request, the way the office works it — E20/S3.
 *
 * The screen listed the requests and let nobody open one: no phone number to call, no trial to read,
 * nowhere to write what was said, "Am contactat" and a claim on the request existing only in the API
 * (QA of 26 September 2026). This is the file. There is still no status control in it, on purpose:
 * „probă ținută" comes from the register and „înscris" from the enrolment, and the two a person
 * declares have their own buttons.
 */
const props = defineProps<{ lead: LeadSummary | null }>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ changed: [lead: LeadSummary]; lose: [lead: LeadSummary] }>();

const { updateLead, markContacted } = useLeadsApi();
const { success, error } = useNotifications();
const userStore = useUserStore();
const myId = computed(() => userStore.user?.id);

/** A sentinel for "no channel": reka-ui refuses an empty value on a select item. */
const NO_CHANNEL = "none";
const channelItems = [
  { label: "Nu știm", value: NO_CHANNEL },
  ...(Object.keys(LEAD_CHANNEL_LABELS) as LeadChannel[]).map((value) => ({
    label: LEAD_CHANNEL_LABELS[value],
    value,
  })),
];

const notes = ref("");
const parentPhone = ref("");
const parentEmail = ref("");
const channel = ref<LeadChannel | typeof NO_CHANNEL>(NO_CHANNEL);
const nextActionAt = ref<string | undefined>(undefined);
const busy = ref<"save" | "claim" | "release" | "contacted" | null>(null);

const settled = computed(() => props.lead?.status === "enrolled" || props.lead?.status === "lost");

watch(
  () => props.lead,
  (lead) => {
    notes.value = lead?.notes ?? "";
    parentPhone.value = lead?.parentPhone ?? "";
    parentEmail.value = lead?.parentEmail ?? "";
    channel.value = lead?.channel ?? NO_CHANNEL;
    nextActionAt.value = lead?.nextActionAt ?? undefined;
  },
  { immediate: true }
);

const run = async (
  kind: NonNullable<typeof busy.value>,
  action: () => Promise<LeadSummary>,
  done: string
) => {
  if (busy.value) return;
  busy.value = kind;
  try {
    const updated = await action();
    success(done);
    emit("changed", updated);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut salva cererea."));
  } finally {
    busy.value = null;
  }
};

/** Only what moved: an untouched field is not sent, so it cannot overwrite somebody else's edit. */
const save = () => {
  const lead = props.lead;
  if (!lead) return;
  const body: UpdateLeadDto = {};
  if (notes.value.trim() !== (lead.notes ?? "")) body.notes = notes.value.trim();
  if (parentPhone.value.trim() !== (lead.parentPhone ?? ""))
    body.parentPhone = parentPhone.value.trim();
  if (parentEmail.value.trim() !== (lead.parentEmail ?? ""))
    body.parentEmail = parentEmail.value.trim();
  if (channel.value !== NO_CHANNEL && channel.value !== lead.channel) body.channel = channel.value;
  if ((nextActionAt.value ?? null) !== lead.nextActionAt) {
    if (nextActionAt.value) body.nextActionAt = nextActionAt.value;
    else body.clearNextAction = true;
  }
  if (Object.keys(body).length === 0) {
    success("Nimic de salvat — cererea e deja așa.");
    return;
  }
  return run("save", () => updateLead(lead.id, body), "Cererea a fost salvată.");
};

const claim = () => {
  const lead = props.lead;
  const me = myId.value;
  if (!lead || !me) return;
  return run("claim", () => updateLead(lead.id, { assignedToId: me }), "Cererea e a ta acum.");
};

const release = () => {
  const lead = props.lead;
  if (!lead) return;
  return run(
    "release",
    () => updateLead(lead.id, { unassign: true }),
    "Cererea nu mai are responsabil."
  );
};

const contacted = () => {
  const lead = props.lead;
  if (!lead) return;
  return run(
    "contacted",
    () => markContacted(lead.id),
    "Cererea e marcată: familia a fost contactată."
  );
};
</script>
