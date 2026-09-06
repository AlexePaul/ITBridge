<template>
  <div class="portal-page">
    <div class="portal-head">
      <span class="kicker">Portalul familiei</span>
      <h1 class="portal-title">Proiectele copiilor</h1>
      <p class="lede measure-wide">
        Tot ce au construit, în ordine. Fișierele se descarcă — sunt ale copilului.
      </p>
    </div>

    <div v-if="children.length > 1" class="switcher-slot">
      <ChildSwitcher :children="children" />
    </div>

    <p v-if="loading" class="portal-empty">Se încarcă…</p>

    <div v-else-if="loadError" class="portal-card portal-card-accent portal-notice" role="alert">
      <p class="body-text">{{ loadError }}</p>
    </div>

    <template v-else>
      <div v-if="downloadable.length > 0" class="archives">
        <button
          v-for="child in downloadable"
          :key="child.id"
          type="button"
          class="btn btn-secondary archive-action"
          :disabled="downloading === child.id"
          @click="downloadArchive(child)"
        >
          <UIcon name="i-lucide-download" class="chip-icon" />
          {{ downloading === child.id ? "Se pregătește…" : `Descarcă tot (${child.firstName})` }}
        </button>
      </div>

      <section class="portal-section">
        <h2 class="portal-label">{{ scopeLabel }} · lucrări</h2>

        <p v-if="visible.length === 0" class="portal-empty">
          Încă nu e nicio lucrare aici. Îți trimitem un email de fiecare dată când una e gata de
          arătat.
        </p>

        <div v-else class="gallery">
          <article v-for="project in visible" :key="project.id" class="project">
            <ProjectThumbnail
              :project-id="project.id"
              :has-thumbnail="project.hasThumbnail"
              :hint="hintFor(project)"
              :alt="`Miniatura lucrării „${project.title}”`"
              :framed="project.hasThumbnail"
            />

            <span class="portal-label project-meta">
              {{ project.child.firstName }} · {{ formatDateKey(project.capturedOn) }}
            </span>
            <h3 class="project-title">{{ project.title }}</h3>
            <p v-if="project.description" class="body-text project-desc">
              {{ project.description }}
            </p>

            <div class="project-files">
              <button
                v-for="file in filesOf(project)"
                :key="file.id"
                type="button"
                class="chip"
                :disabled="downloadingFile === file.id"
                @click="downloadFile(project.id, file.id)"
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
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useChildSelection } from "~/composables/useChildSelection";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { formatDateKey } from "~/composables/useAdminFormat";
import { useChildrenStore } from "~/stores/childrenStore";
import { useTokenStore } from "~/stores/tokenStore";
import type { Child } from "~/types/child.types";
import type { Project, ProjectFile } from "~/types/project.types";

/**
 * The parent's gallery — E14/S5, on the E18/S4 design.
 *
 * **Only what has been sent appears here**, and that is enforced by the API rather than by this
 * page: a document still in review has not been looked at by anyone, and the portal must not be the
 * back door around the screen where somebody looks at it first.
 *
 * Downloads go through the backend, never straight to storage. The button asks for a signed URL, the
 * backend checks the child is this parent's, and the browser follows the URL it gets back. A storage
 * URL never appears in a page, an email or a log.
 *
 * The child list comes from `/children` rather than from the projects themselves. Reading it off the
 * projects meant a child with no work yet had no tab — so the one parent who most needed to be told
 * "nothing here yet, and we will email you" was the one who could not select their child to be told.
 */
definePageMeta({ layout: "portal" as any, title: "Proiectele copiilor" });

const { fetchProjects, fileDownloadUrl } = useProjectsApi();
const childrenApi = useChildrenApi();
const childrenStore = useChildrenStore();
const notifications = useNotifications();
const tokenStore = useTokenStore();
const config = useRuntimeConfig();
const { includes, isShowingAll, selected, reconcile } = useChildSelection();

const loading = ref(true);
const loadError = ref<string | null>(null);
const projects = ref<Project[]>([]);
const downloading = ref<number | null>(null);
const downloadingFile = ref<number | null>(null);

const children = computed(() => childrenStore.children);

const scopeLabel = computed(() => {
  if (isShowingAll.value) return "Toți copiii";
  return children.value.find((child) => child.id === selected.value)?.firstName ?? "Copilul ales";
});

const visible = computed(() =>
  projects.value
    .filter((project) => includes(project.child.id))
    .sort((a, b) => b.capturedOn.localeCompare(a.capturedOn))
);

/** Only children who actually have something to put in an archive. */
const downloadable = computed(() =>
  children.value.filter(
    (child) => includes(child.id) && projects.value.some((p) => p.child.id === child.id)
  )
);

/**
 * Every file across every version, flattened.
 *
 * No filter on whether the bytes arrived: a project with an unfinished upload cannot be sent, and a
 * parent only ever sees what has been sent — so the case does not reach this page. The download
 * endpoint refuses one anyway, which is where the check belongs.
 */
function filesOf(project: Project): ProjectFile[] {
  return project.versions.flatMap((version) => version.files);
}

/** What the placeholder reads to pick its mark: the first file's name, else the title. */
function hintFor(project: Project): string {
  return filesOf(project)[0]?.originalName ?? project.title;
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [fetched, mine] = await Promise.all([fetchProjects(), childrenApi.fetchChildren()]);
    projects.value = fetched;
    reconcile(mine);
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function downloadFile(projectId: number, fileId: number) {
  downloadingFile.value = fileId;
  try {
    const { url } = await fileDownloadUrl(projectId, fileId);
    // `window.location` rather than `fetch`: the signed URL carries
    // `Content-Disposition: attachment`, so letting the browser follow it is what makes the file
    // save itself instead of being rendered.
    window.location.href = url;
  } catch (err) {
    notifications.error("Nu am putut deschide fișierul", apiErrorMessage(err));
  } finally {
    downloadingFile.value = null;
  }
}

/**
 * The whole archive for one child.
 *
 * Fetched with the bearer token and handed to the browser as a blob, for the same reason the
 * thumbnails are: a plain link carries no `Authorization` header, and this endpoint needs one.
 */
async function downloadArchive(child: Child) {
  downloading.value = child.id;
  try {
    const response = await fetch(
      `${config.public.apiBase as string}/projects/child/${child.id}/archive`,
      { headers: { Authorization: `Bearer ${tokenStore.accessToken}` } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `proiecte-${child.firstName.toLowerCase()}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    notifications.error("Nu am putut descărca arhiva", apiErrorMessage(err));
  } finally {
    downloading.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.switcher-slot {
  margin-top: var(--rhythm-2);
}

.archives {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--rhythm-2);
}

.archive-action {
  min-height: 44px;
}

/* A gallery, not a list of rows: this is the page that has to justify the fee emotionally, and a
   table of filenames does not. */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--rhythm-3) var(--rhythm-2);
  margin-top: var(--rhythm-2);
}

.project {
  display: flex;
  flex-direction: column;
}

.project-meta {
  margin-top: var(--space-4);
}

.project-desc {
  margin-top: var(--space-2);
}

.project-files {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.chip-icon {
  width: 14px;
  height: 14px;
  color: var(--color-accent-ink);
}
</style>
