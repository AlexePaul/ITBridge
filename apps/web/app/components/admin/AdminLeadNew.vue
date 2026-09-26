<template>
  <UModal
    v-model:open="open"
    title="Cerere nouă"
    description="O familie care a sunat sau a trecut pe la birou."
  >
    <template #body>
      <form class="space-y-3" novalidate @submit.prevent="submit">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UFormField
            label="Numele părintelui"
            name="parentName"
            required
            :error="errors.parentName"
          >
            <UInput v-model="form.parentName" class="w-full" />
          </UFormField>
          <UFormField label="Cum a venit cererea" name="source" required>
            <USelect v-model="form.source" :items="sourceItems" class="w-full" />
          </UFormField>
          <UFormField label="Telefon" name="parentPhone" :error="errors.contact">
            <UInput v-model="form.parentPhone" type="tel" class="w-full" />
          </UFormField>
          <UFormField label="Email" name="parentEmail">
            <UInput v-model="form.parentEmail" type="email" class="w-full" />
          </UFormField>
          <UFormField
            label="Prenumele copilului"
            name="childFirstName"
            required
            :error="errors.childFirstName"
          >
            <UInput v-model="form.childFirstName" class="w-full" />
          </UFormField>
          <UFormField
            label="Numele copilului"
            name="childLastName"
            required
            :error="errors.childLastName"
          >
            <UInput v-model="form.childLastName" class="w-full" />
          </UFormField>
          <UFormField
            label="Data nașterii"
            name="childBirthDate"
            required
            :error="errors.childBirthDate"
          >
            <AdminDateField
              v-model="form.childBirthDate"
              :max="today"
              label="data nașterii copilului"
            />
          </UFormField>
          <UFormField label="Unde ar veni" name="locationId">
            <USelect v-model="form.locationId" :items="locationItems" class="w-full" />
          </UFormField>
          <UFormField label="De unde a auzit de școală" name="channel">
            <USelect v-model="form.channel" :items="channelItems" class="w-full" />
          </UFormField>
          <UFormField label="Pasul următor" name="nextActionAt">
            <AdminDateField v-model="form.nextActionAt" :min="today" label="ziua pasului următor" />
          </UFormField>
        </div>
        <UFormField label="Ce a mai făcut copilul" name="experience">
          <UInput v-model="form.experience" class="w-full" />
        </UFormField>
        <UFormField label="Note" name="notes">
          <UTextarea v-model="form.notes" :rows="2" class="w-full" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" :disabled="saving" @click="open = false"
          >Renunță</UButton
        >
        <UButton :loading="saving" class="min-h-11" @click="submit">Adaugă cererea</UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useLeadsApi } from "~/composables/api/useLeadsApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { todayKey } from "~/composables/useAttendanceCalendar";
import { useNotifications } from "~/composables/useNotifications";
import { useLocationStore } from "~/stores/locationStore";
import { LEAD_CHANNEL_LABELS, LEAD_SOURCE_LABELS } from "~/types/lead.types";
import type { CreateLeadDto, LeadChannel, LeadSource, LeadSummary } from "~/types/lead.types";

/**
 * A request typed in by the office — E20/S1's other door. `POST /leads` existed and no screen
 * called it, so a family that phoned was nowhere in the funnel (QA of 26 September 2026).
 *
 * The site's form is not a choice here: `trial_form` means the family filled it in themselves.
 */
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ created: [lead: LeadSummary] }>();

const { createLead } = useLeadsApi();
const { success, error } = useNotifications();
const locationStore = useLocationStore();
const today = todayKey();

const NONE = "none";
const sourceItems = (["phone", "walk_in", "referral", "other"] as LeadSource[]).map((value) => ({
  label: LEAD_SOURCE_LABELS[value],
  value,
}));
const channelItems = [
  { label: "Nu știm", value: NONE },
  ...(Object.keys(LEAD_CHANNEL_LABELS) as LeadChannel[]).map((value) => ({
    label: LEAD_CHANNEL_LABELS[value],
    value,
  })),
];
const locationItems = computed(() => [
  { label: "Fără preferință", value: NONE },
  ...locationStore.locations.map((location) => ({
    label: location.name,
    value: String(location.id),
  })),
]);

const blank = () => ({
  parentName: "",
  parentPhone: "",
  parentEmail: "",
  childFirstName: "",
  childLastName: "",
  childBirthDate: undefined as string | undefined,
  source: "phone" as LeadSource,
  channel: NONE as LeadChannel | typeof NONE,
  locationId: NONE as string,
  nextActionAt: undefined as string | undefined,
  experience: "",
  notes: "",
});
const form = reactive(blank());
const errors = reactive<Record<string, string | undefined>>({});
const saving = ref(false);

watch(open, (isOpen) => {
  if (isOpen) {
    Object.assign(form, blank());
    for (const key of Object.keys(errors)) errors[key] = undefined;
  }
});

const validate = (): boolean => {
  errors.parentName = form.parentName.trim() ? undefined : "Scrie numele părintelui.";
  errors.childFirstName = form.childFirstName.trim() ? undefined : "Scrie prenumele copilului.";
  errors.childLastName = form.childLastName.trim() ? undefined : "Scrie numele copilului.";
  errors.childBirthDate = form.childBirthDate ? undefined : "Alege data nașterii.";
  // The API's own rule (CONTACT_REQUIRED): a request nobody can call back is not a request.
  errors.contact =
    form.parentPhone.trim() || form.parentEmail.trim()
      ? undefined
      : "Lasă un telefon sau un email, ca să poată suna cineva înapoi.";
  return Object.values(errors).every((message) => !message);
};

const submit = async () => {
  if (saving.value || !validate()) return;
  const body: CreateLeadDto = {
    parentName: form.parentName.trim(),
    childFirstName: form.childFirstName.trim(),
    childLastName: form.childLastName.trim(),
    childBirthDate: form.childBirthDate!,
    source: form.source,
    ...(form.parentPhone.trim() ? { parentPhone: form.parentPhone.trim() } : {}),
    ...(form.parentEmail.trim() ? { parentEmail: form.parentEmail.trim() } : {}),
    ...(form.channel !== NONE ? { channel: form.channel } : {}),
    ...(form.locationId !== NONE ? { locationId: Number(form.locationId) } : {}),
    ...(form.nextActionAt ? { nextActionAt: form.nextActionAt } : {}),
    ...(form.experience.trim() ? { experience: form.experience.trim() } : {}),
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
  };
  saving.value = true;
  try {
    const created = await createLead(body);
    success("Cererea a fost adăugată.");
    open.value = false;
    emit("created", created);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut adăuga cererea."));
  } finally {
    saving.value = false;
  }
};
</script>
