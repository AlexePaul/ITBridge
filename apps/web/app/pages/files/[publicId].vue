<template>
  <div class="portal-page file-page">
    <div v-if="loadError" class="portal-card portal-card-accent portal-notice" role="alert">
      <p class="body-text">{{ loadError }}</p>
      <p class="note">
        Dacă ai primit linkul pe email și tot nu se deschide, scrie-ne și ne uităm noi.
      </p>
    </div>

    <p v-else-if="loading" class="portal-empty">Se încarcă…</p>

    <template v-else-if="project">
      <div class="portal-head">
        <NuxtLink to="/user/proiecte" class="link back">← Toate proiectele</NuxtLink>
        <span class="portal-label back-meta">
          {{ project.child.firstName }} · {{ formatDateKey(project.capturedOn) }}
        </span>
        <h1 class="portal-title">{{ project.title }}</h1>
      </div>

      <div class="plate-slot">
        <ProjectThumbnail
          :project-id="project.id"
          :has-thumbnail="project.hasThumbnail"
          :hint="files[0]?.originalName ?? project.title"
          :alt="`Miniatura lucrării „${project.title}”`"
        />
      </div>

      <p v-if="project.description" class="body-text description">{{ project.description }}</p>

      <div class="file-chips">
        <button
          v-for="file in files"
          :key="file.id"
          type="button"
          class="chip"
          :disabled="downloading === file.id"
          @click="download(file.id)"
        >
          <UIcon name="i-lucide-download" class="chip-icon" />
          {{ file.originalName }}
        </button>
        <a
          v-for="link in project.links"
          :key="`link-${link.id}`"
          :href="link.url"
          class="chip"
          target="_blank"
          rel="noopener noreferrer"
        >
          <UIcon name="i-lucide-external-link" class="chip-icon" />
          {{ link.label }}
        </a>
      </div>

      <!--
        E14/S7, the third mechanism: the parent reports, the parent does not delete. A file saved
        into the folder next to the right one is a disclosure of another family's data, and the
        person most likely to notice is the one who opened it.
      -->
      <p class="portal-empty report">
        Nu pare lucrarea copilului tău?
        <button type="button" class="link link-button" @click="reportOpen = true">Spune-ne</button>
        și verificăm.
      </p>
    </template>

    <UModal v-model:open="reportOpen" title="Semnalează o problemă">
      <template #body>
        <div class="form">
          <p class="body-text">
            Trimitem mesajul la școală. Nu ștergem nimic automat — ne uităm întâi.
          </p>
          <div class="field">
            <label for="report-note">Ce nu e în regulă?</label>
            <textarea
              id="report-note"
              v-model="note"
              class="input"
              rows="3"
              placeholder="Pare lucrarea altui copil din grupă…"
            ></textarea>
            <p class="field-hint">Opțional.</p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" @click="reportOpen = false">
            Renunță
          </button>
          <button type="button" class="btn btn-primary" :disabled="reporting" @click="submitReport">
            {{ reporting ? "Se trimite…" : "Trimite" }}
          </button>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatDateKey } from "~/composables/useAdminFormat";
import type { Project } from "~/types/project.types";

/**
 * What the link in a parent's email opens. E14/S5, on the E18/S4 portal.
 *
 * **It requires a login, and that is the decision.** A link that works without an account works for
 * whoever it gets forwarded to, and what opens is a named child's work. The extra step is paid once —
 * after the first sign-in the session holds — and it buys total control over who sees what.
 *
 * The identifier in the URL is random rather than the project's number. That is not the security
 * boundary, which is the ownership check in the backend; it is what stops the boundary from being
 * probed one integer at a time.
 */
definePageMeta({ layout: "portal" as any, title: "Lucrarea copilului" });

const route = useRoute();
const publicId = String(route.params.publicId);

const { fetchByPublicId, fileDownloadUrl, reportProject } = useProjectsApi();
const notifications = useNotifications();

const loading = ref(true);
const loadError = ref<string | null>(null);
const project = ref<Project | null>(null);
const downloading = ref<number | null>(null);
const reportOpen = ref(false);
const reporting = ref(false);
const note = ref("");

const files = computed(() => project.value?.versions.flatMap((version) => version.files) ?? []);

onMounted(async () => {
  try {
    project.value = await fetchByPublicId(publicId);
  } catch (err) {
    // 403 and 404 read differently on purpose, and `apiErrorMessage` already distinguishes them:
    // the resource existing but not being yours is a thing worth saying out loud, because a silent
    // refusal is harder for a parent to report than an explicit one.
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
});

async function download(fileId: number) {
  if (!project.value) return;
  downloading.value = fileId;
  try {
    const { url } = await fileDownloadUrl(project.value.id, fileId);
    window.location.href = url;
  } catch (err) {
    notifications.error("Nu am putut deschide fișierul", apiErrorMessage(err));
  } finally {
    downloading.value = null;
  }
}

async function submitReport() {
  reporting.value = true;
  try {
    await reportProject(publicId, note.value || undefined);
    reportOpen.value = false;
    note.value = "";
    notifications.success("Mulțumim", "Am trimis mesajul la școală.");
  } catch (err) {
    notifications.error("Nu am putut trimite mesajul", apiErrorMessage(err));
  } finally {
    reporting.value = false;
  }
}
</script>

<style scoped>
.file-page {
  max-width: 720px;
}

.back {
  display: inline-block;
  min-height: 44px;
  line-height: 44px;
  text-decoration: none;
}

.back-meta {
  margin-top: var(--space-2);
}

.plate-slot {
  max-width: 420px;
  margin-top: var(--rhythm-2);
}

.description {
  margin-top: var(--rhythm-1);
  max-width: 58ch;
}

.file-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--rhythm-1);
}

.chip-icon {
  width: 14px;
  height: 14px;
  color: var(--color-accent-ink);
}

.report {
  margin-top: var(--rhythm-2);
}

.link-button {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  width: 100%;
}
</style>
