<template>
  <AdminPage
    title="Șabloane de email"
    subtitle="Formularea mesajelor pe care le trimite platforma. Se modifică de aici, fără deploy; ce nu atingi rămâne pe textul din cod."
  >
    <AdminLoading v-if="loading" />
    <AdminError v-else-if="loadError" :message="loadError" />

    <template v-else>
      <!-- The list -->
      <div v-if="!selected" class="space-y-2">
        <AdminListRow
          v-for="template in templates"
          :key="template.key"
          :title="template.name"
          :subtitle="template.description"
          clickable
          @click="openTemplate(template.key)"
        >
          <template #badges>
            <UBadge v-if="template.customized" color="info" variant="subtle" size="sm">
              Personalizat · v{{ template.version }}
            </UBadge>
          </template>
          <template #actions>
            <UIcon name="i-lucide-chevron-right" class="text-muted" />
          </template>
        </AdminListRow>
      </div>

      <!-- The editor -->
      <template v-else>
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold text-lg">{{ selected.name }}</p>
            <p class="text-muted text-sm">{{ selected.description }}</p>
          </div>
          <UButton variant="ghost" size="sm" @click="closeTemplate">Toate șabloanele</UButton>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form class="space-y-4" @submit.prevent="save">
            <UFormField label="Subiect" required>
              <UInput v-model="draft.subject" class="w-full font-mono text-sm" />
            </UFormField>
            <UFormField label="Corp text" required help="Varianta simplă — fiecare mesaj o are.">
              <UTextarea v-model="draft.bodyText" :rows="14" class="w-full font-mono text-sm" />
            </UFormField>
            <UFormField label="Corp HTML" help="Gol înseamnă că mesajul pleacă doar ca text.">
              <UTextarea v-model="draft.bodyHtml" :rows="10" class="w-full font-mono text-sm" />
            </UFormField>

            <UCard variant="subtle" class="border">
              <p class="text-sm font-semibold mb-2">Variabile</p>
              <ul class="space-y-1 text-sm text-muted">
                <li v-for="variable in selected.variables" :key="variable.name">
                  <code class="text-default">{{ placeholderOf(variable.name) }}</code> —
                  {{ variable.description }}
                </li>
              </ul>
            </UCard>

            <AdminFormActions
              submit-label="Salvează formularea"
              :loading="saving"
              @cancel="closeTemplate"
            />
            <UButton
              v-if="selected.customized"
              color="error"
              variant="soft"
              size="sm"
              class="w-full justify-center"
              @click="revertOpen = true"
            >
              Revino la textul din cod (v1)
            </UButton>
          </form>

          <!-- The preview: always of what is typed, never of what was saved. -->
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-muted uppercase tracking-wide">
                Previzualizare cu date de test
              </p>
              <UIcon
                v-if="previewLoading"
                name="i-lucide-loader-circle"
                class="animate-spin text-muted"
              />
            </div>
            <template v-if="preview">
              <UCard variant="subtle" class="border">
                <p class="text-xs text-muted mb-1">Subiect</p>
                <p class="font-medium">{{ preview.subject }}</p>
              </UCard>
              <UCard variant="subtle" class="border">
                <p class="text-xs text-muted mb-2">Text</p>
                <pre class="text-sm whitespace-pre-wrap font-sans">{{ preview.bodyText }}</pre>
              </UCard>
              <UCard v-if="preview.bodyHtml" variant="subtle" class="border">
                <p class="text-xs text-muted mb-2">HTML</p>
                <!-- Sandboxed and script-less: the content is the admin's own draft, but there is
                     no reason to let a pasted snippet run anything here. -->
                <iframe
                  :srcdoc="preview.bodyHtml"
                  sandbox=""
                  title="Previzualizare HTML"
                  class="w-full h-96 border border-muted rounded-lg bg-white"
                ></iframe>
              </UCard>
            </template>
          </div>
        </div>

        <AdminConfirmModal
          v-model:open="revertOpen"
          title="Revii la textul din cod?"
          confirm-label="Revino la v1"
          danger
          :loading="reverting"
          @confirm="revert"
        >
          <template #body>
            <p class="text-sm">
              Formularea personalizată se șterge definitiv. Mesajele deja aflate în coadă nu se
              schimbă — ele au fost scrise cu textul valabil la momentul cozii.
            </p>
          </template>
        </AdminConfirmModal>
      </template>
    </template>
  </AdminPage>
</template>

<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useMailTemplatesApi } from "~/composables/api/useMailTemplatesApi";
import { useNotifications } from "~/composables/useNotifications";
import type {
  MailTemplateDetail,
  MailTemplateRendered,
  MailTemplateSummary,
} from "~/types/mail.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Șabloane de email",
});

const api = useMailTemplatesApi();
const { success, error } = useNotifications();

const loading = ref(true);
const loadError = ref("");
const templates = ref<MailTemplateSummary[]>([]);

const selected = ref<MailTemplateDetail | null>(null);
const draft = reactive({ subject: "", bodyText: "", bodyHtml: "" });
const saving = ref(false);
const revertOpen = ref(false);
const reverting = ref(false);

const preview = ref<MailTemplateRendered | null>(null);
const previewLoading = ref(false);

/** `firstName` → `{{firstName}}`. In script, because literal `}}` ends a template interpolation. */
const placeholderOf = (name: string) => `{{${name}}}`;

const load = async () => {
  loading.value = true;
  loadError.value = "";
  try {
    templates.value = await api.fetchTemplates();
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Eroare la încărcarea șabloanelor");
  } finally {
    loading.value = false;
  }
};

onMounted(load);

const openTemplate = async (key: string) => {
  try {
    const detail = await api.fetchTemplate(key);
    selected.value = detail;
    draft.subject = detail.subject;
    draft.bodyText = detail.bodyText;
    draft.bodyHtml = detail.bodyHtml ?? "";
    await refreshPreview();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la încărcarea șablonului"));
  }
};

const closeTemplate = () => {
  selected.value = null;
  preview.value = null;
};

/**
 * Sequenced like the calendar's impact preview: a slow answer for an earlier draft must not
 * overwrite the answer for what is typed now.
 */
let previewToken = 0;
const refreshPreview = async () => {
  if (!selected.value) return;
  const token = ++previewToken;
  previewLoading.value = true;
  try {
    const rendered = await api.previewTemplate(selected.value.key, {
      subject: draft.subject,
      bodyText: draft.bodyText,
      bodyHtml: draft.bodyHtml || null,
    });
    if (token === previewToken) preview.value = rendered;
  } catch {
    // A failed preview while typing is not worth a toast; saving is the guarded action.
  } finally {
    if (token === previewToken) previewLoading.value = false;
  }
};

let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [draft.subject, draft.bodyText, draft.bodyHtml],
  () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => void refreshPreview(), 400);
  }
);

const save = async () => {
  if (!selected.value) return;
  saving.value = true;
  try {
    const detail = await api.saveTemplate(selected.value.key, {
      subject: draft.subject,
      bodyText: draft.bodyText,
      bodyHtml: draft.bodyHtml || null,
    });
    selected.value = detail;
    success(`Salvat — v${detail.version}. Mesajele următoare pleacă cu formularea asta.`);
    await load();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la salvarea șablonului"));
  } finally {
    saving.value = false;
  }
};

const revert = async () => {
  if (!selected.value) return;
  reverting.value = true;
  try {
    const detail = await api.revertTemplate(selected.value.key);
    selected.value = detail;
    draft.subject = detail.subject;
    draft.bodyText = detail.bodyText;
    draft.bodyHtml = detail.bodyHtml ?? "";
    revertOpen.value = false;
    success("Șablonul a revenit la textul din cod.");
    await Promise.all([load(), refreshPreview()]);
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la revenirea la textul din cod"));
  } finally {
    reverting.value = false;
  }
};
</script>
