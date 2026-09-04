<template>
  <AdminPage
    title="Anunțuri"
    subtitle="Un mesaj către o grupă, o locație sau toată școala. Un email nu se poate retrage, deci nimic nu pleacă fără previzualizare și confirmare."
    width="xl"
  >
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- What is being written -->
      <form class="space-y-4" @submit.prevent="openConfirm">
        <div class="flex flex-wrap gap-3">
          <UFormField label="Cui" class="w-48">
            <USelect v-model="draft.audience" :items="audienceItems" class="w-full" />
          </UFormField>
          <UFormField v-if="draft.audience === 'group'" label="Grupa" class="w-64">
            <USelect v-model="draft.groupId" :items="groupItems" class="w-full" />
          </UFormField>
          <UFormField v-if="draft.audience === 'location'" label="Locația" class="w-64">
            <USelect v-model="draft.locationId" :items="locationItems" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Fel" :help="KIND_HINTS[draft.kind]">
          <USelect v-model="draft.kind" :items="kindItems" class="w-full" />
        </UFormField>

        <UFormField label="Subiect" required>
          <UInput v-model="draft.subject" placeholder="Sâmbătă e zi liberă" class="w-full" />
        </UFormField>

        <UFormField
          label="Mesaj"
          required
          help="Salutul și semnătura se adaugă singure, pentru fiecare familie în parte."
        >
          <UTextarea v-model="draft.body" :rows="10" class="w-full" />
        </UFormField>

        <!-- The rule the whole screen exists to protect. -->
        <div
          v-if="preview && preview.warnings.length > 0"
          class="border-l-2 border-warning pl-3 py-1 space-y-1"
        >
          <p class="text-sm font-medium">{{ warningSentence }}</p>
          <p class="text-sm text-muted">
            Un anunț se adresează unei grupe sau unei locații și nu are voie să vorbească despre un
            copil anume. Dacă e o coincidență, poți trimite oricum — o să te întrebe încă o dată.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton type="submit" :disabled="!canSend" :loading="sending">Trimite anunțul</UButton>
          <UButton
            variant="soft"
            color="neutral"
            :disabled="!canSend"
            :loading="testing"
            @click="sendTest"
          >
            Trimite-mi un test
          </UButton>
        </div>
      </form>

      <!-- What would go out, exactly -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-muted uppercase tracking-wide">Previzualizare</p>
          <UIcon
            v-if="previewLoading"
            name="i-lucide-loader-circle"
            class="animate-spin text-muted"
          />
        </div>

        <AdminEmpty
          v-if="!preview"
          icon="i-lucide-megaphone"
          title="Scrie subiectul și mesajul"
          description="Previzualizarea apare pe măsură ce tastezi și spune și către câte familii ar pleca."
        />

        <template v-else>
          <UCard variant="subtle" class="border">
            <p class="text-xs text-muted mb-2">{{ preview.audienceLabel }}</p>
            <p class="text-2xl font-semibold tabular-nums">
              {{ preview.recipients.deliverable }}
              {{ preview.recipients.deliverable === 1 ? "familie" : "de familii" }}
            </p>
            <ul class="text-sm text-muted mt-2 space-y-0.5">
              <li v-if="preview.recipients.noAddress > 0">
                {{ preview.recipients.noAddress }} fără adresă — sună-le, nu primesc nimic
              </li>
              <li v-if="preview.recipients.unconfirmedAddress > 0">
                {{ preview.recipients.unconfirmedAddress }} cu adresă neconfirmată — retrimite-le
                linkul
              </li>
              <li v-if="preview.recipients.declined > 0">
                {{ preview.recipients.declined }} n-au bifat mesajele promoționale
              </li>
            </ul>
          </UCard>

          <UCard variant="subtle" class="border">
            <p class="text-xs text-muted mb-1">Subiect</p>
            <p class="font-medium">{{ preview.subject }}</p>
          </UCard>

          <UCard variant="subtle" class="border">
            <p class="text-xs text-muted mb-2">Așa îl vede o familie</p>
            <!-- Sandboxed: the content is the admin's own words, but there is no reason to let a
                 pasted snippet run anything here. -->
            <iframe
              :srcdoc="preview.bodyHtml"
              sandbox=""
              title="Previzualizarea anunțului"
              class="w-full h-96 border border-muted rounded-lg bg-white"
            ></iframe>
          </UCard>
        </template>
      </div>
    </div>

    <!-- What has already gone out -->
    <div class="space-y-2 pt-2">
      <h2 class="text-lg font-semibold">Anunțuri trimise</h2>

      <AdminLoading v-if="loading" />
      <AdminError v-else-if="loadError" :message="loadError" />
      <AdminEmpty
        v-else-if="sent.length === 0"
        icon="i-lucide-inbox"
        title="Niciun anunț încă"
        description="Ce trimiți de aici rămâne aici, cu câte mesaje au plecat și câte n-au avut unde."
      />

      <!-- The loop lives inside the `v-else`, not on it: in Vue 3 `v-if` wins over `v-for` on the
           same element, so the pair reads backwards from how it is written. -->
      <div v-else class="space-y-2">
        <AdminListRow
          v-for="announcement in sent"
          :key="announcement.id"
          :title="announcement.subject"
          :subtitle="`${audienceOf(announcement)} · ${formatDateKey(announcement.createdAt)}${announcement.sentByUsername ? ` · ${announcement.sentByUsername}` : ''}`"
        >
          <template #badges>
            <UBadge
              v-if="announcement.kind === 'marketing'"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ KIND_LABELS.marketing }}
            </UBadge>
          </template>
          <template #actions>
            <UBadge
              v-for="state in statesWithMessages(announcement)"
              :key="state"
              :color="DELIVERY_STATUS_COLORS[state]"
              variant="subtle"
              size="sm"
            >
              {{ announcement.deliveries[state] }} {{ DELIVERY_STATUS_LABELS[state].toLowerCase() }}
            </UBadge>
            <UBadge
              v-if="announcement.declinedCount > 0"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              {{ announcement.declinedCount }} refuzate
            </UBadge>
          </template>
        </AdminListRow>
      </div>
    </div>

    <AdminConfirmModal
      v-model:open="confirmOpen"
      title="Trimiți anunțul?"
      confirm-label="Trimite"
      :loading="sending"
      @confirm="send"
    >
      <template #body>
        <p class="text-sm">
          Pleacă la
          <strong
            >{{ preview?.recipients.deliverable ?? 0 }}
            {{ preview?.recipients.deliverable === 1 ? "familie" : "de familii" }}</strong
          >
          din {{ preview?.audienceLabel }}. Un email trimis nu se poate retrage.
        </p>
        <p v-if="preview && preview.warnings.length > 0" class="text-sm mt-3">
          {{ warningSentence }} Trimite doar dacă e o coincidență, nu dacă e vorba despre copilul
          cuiva.
        </p>
      </template>
    </AdminConfirmModal>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useAnnouncementsApi } from "~/composables/api/useAnnouncementsApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useLocationsApi } from "~/composables/api/useLocationsApi";
import { useNotifications } from "~/composables/useNotifications";
import { formatDateKey } from "~/composables/useAdminFormat";
import type {
  AnnouncementAudience,
  AnnouncementKind,
  AnnouncementPreview,
  AnnouncementSummary,
} from "~/types/announcement.types";
import { AUDIENCE_LABELS, KIND_HINTS, KIND_LABELS } from "~/types/announcement.types";
import type { DeliveryStatus } from "~/types/delivery.types";
import { DELIVERY_STATUS_COLORS, DELIVERY_STATUS_LABELS } from "~/types/delivery.types";
import type { Group } from "~/types/group.types";
import type { Location } from "~/types/location.types";

/**
 * Announcements — E17/S7.
 *
 * The whole screen is built around one sentence from the epic: a mistaken mass email cannot be
 * recalled. So the preview is not a nicety — it renders the real composed message, says how many
 * families would get it and how many would not, and reports any child's first name it finds in the
 * text. The confirm dialog repeats both numbers, and the test send exists so the first person to
 * read the announcement is the person who wrote it.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Anunțuri",
});

const api = useAnnouncementsApi();
const groupsApi = useGroupsApi();
const locationsApi = useLocationsApi();
const { success, error } = useNotifications();

const draft = reactive({
  audience: "all" as AnnouncementAudience,
  groupId: undefined as number | undefined,
  locationId: undefined as number | undefined,
  kind: "transactional" as AnnouncementKind,
  subject: "",
  body: "",
});

const groups = ref<Group[]>([]);
const locations = ref<Location[]>([]);
const sent = ref<AnnouncementSummary[]>([]);
const loading = ref(true);
const loadError = ref("");

const preview = ref<AnnouncementPreview | null>(null);
const previewLoading = ref(false);
const sending = ref(false);
const testing = ref(false);
const confirmOpen = ref(false);

const audienceItems = computed(() =>
  (["all", "location", "group"] as AnnouncementAudience[]).map((value) => ({
    value,
    label: AUDIENCE_LABELS[value],
  }))
);

const kindItems = computed(() =>
  (["transactional", "marketing"] as AnnouncementKind[]).map((value) => ({
    value,
    label: KIND_LABELS[value],
  }))
);

const groupItems = computed(() =>
  groups.value.map((group) => ({ value: group.id, label: group.name }))
);

const locationItems = computed(() =>
  locations.value.map((location) => ({ value: location.id, label: location.name }))
);

/**
 * The server validates all of this too; this is only about not asking it a question that cannot
 * have an answer while somebody is still typing.
 */
const complete = computed(
  () =>
    draft.subject.trim().length >= 3 &&
    draft.body.trim().length >= 10 &&
    (draft.audience !== "group" || draft.groupId !== undefined) &&
    (draft.audience !== "location" || draft.locationId !== undefined)
);

const canSend = computed(() => complete.value && !previewLoading.value && preview.value !== null);

const payload = () => ({
  audience: draft.audience,
  groupId: draft.audience === "group" ? draft.groupId : undefined,
  locationId: draft.audience === "location" ? draft.locationId : undefined,
  kind: draft.kind,
  subject: draft.subject,
  body: draft.body,
});

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    const [announcements, groupList, locationList] = await Promise.all([
      api.fetchAnnouncements(),
      groupsApi.fetchGroups(),
      locationsApi.fetchLocations(),
    ]);
    sent.value = announcements;
    groups.value = groupList;
    locations.value = locationList;
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea anunțurilor");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

/**
 * Sequenced with a token, like the template editor's: a slow answer for an earlier draft must not
 * overwrite the answer for what is typed now. On a screen whose whole job is showing what will go
 * out, a stale preview is worse than none.
 */
let previewToken = 0;
const refreshPreview = async () => {
  if (!complete.value) {
    preview.value = null;
    return;
  }
  const token = ++previewToken;
  previewLoading.value = true;
  try {
    const rendered = await api.previewAnnouncement(payload());
    if (token === previewToken) preview.value = rendered;
  } catch {
    // A failed preview while typing is not worth a notification; sending is the guarded action.
    if (token === previewToken) preview.value = null;
  } finally {
    if (token === previewToken) previewLoading.value = false;
  }
};

let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [draft.audience, draft.groupId, draft.locationId, draft.kind, draft.subject, draft.body],
  () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void refreshPreview(), 400);
  }
);

const openConfirm = () => {
  if (canSend.value) confirmOpen.value = true;
};

const sendTest = async () => {
  testing.value = true;
  try {
    const { to } = await api.sendTestAnnouncement(payload());
    success(`Testul a fost pus la trimitere către ${to}.`);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la trimiterea testului"));
  } finally {
    testing.value = false;
  }
};

const send = async () => {
  sending.value = true;
  try {
    // The preview has already shown the warnings and the confirm dialog has repeated them, so this
    // press is the acknowledgement the server asks for.
    const result = await api.sendAnnouncement({ ...payload(), acknowledgeWarnings: true });
    confirmOpen.value = false;
    const skipped = result.undeliverable.length;
    success(
      `Anunțul a plecat către ${result.queued} ${result.queued === 1 ? "familie" : "de familii"}.` +
        (skipped > 0 ? ` ${skipped} n-au avut unde — vezi lista de mai jos.` : "")
    );
    draft.subject = "";
    draft.body = "";
    preview.value = null;
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la trimiterea anunțului"));
  } finally {
    sending.value = false;
  }
};

const audienceOf = (announcement: AnnouncementSummary) =>
  announcement.groupName
    ? `Grupa ${announcement.groupName}`
    : (announcement.locationName ?? AUDIENCE_LABELS[announcement.audience]);

/**
 * The warning, in one sentence, written once and read in two places — the form and the confirm
 * dialog. Naming the words found is the whole value of the check: "conține un prenume de copil"
 * cannot be judged, "conține „Ștefan”" can be, in a second.
 */
const warningSentence = computed(() => {
  const names = preview.value?.warnings ?? [];
  const quoted = names.map((name) => `„${name}”`).join(", ");
  return names.length === 1
    ? `Mesajul conține ${quoted} — prenumele unui copil din școală.`
    : `Mesajul conține ${quoted} — prenume de copii din școală.`;
});

/** Only the states this announcement actually has messages in; four badges of zero say nothing. */
const statesWithMessages = (announcement: AnnouncementSummary): DeliveryStatus[] =>
  (["sent", "pending", "failed", "undeliverable"] as DeliveryStatus[]).filter(
    (state) => announcement.deliveries[state] > 0
  );
</script>
