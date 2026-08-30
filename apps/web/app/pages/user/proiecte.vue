<template>
  <div class="w-full max-w-4xl mx-auto px-4 py-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Ce au construit copiii tăi</h1>
      <p class="text-muted mt-1">
        Toate lucrările, în ordine cronologică. Le poți descărca — sunt ale copilului.
      </p>
    </div>

    <UCard v-if="loadError" class="border border-error" variant="subtle">
      <p class="font-medium">{{ loadError }}</p>
    </UCard>

    <div v-else-if="loading" class="py-12 text-center text-muted">Se încarcă…</div>

    <UCard v-else-if="projects.length === 0" variant="subtle" class="border">
      <div class="py-8 text-center space-y-2">
        <UIcon name="i-lucide-sparkles" class="text-3xl text-muted" />
        <p class="font-medium">Încă nu e nimic aici.</p>
        <p class="text-sm text-muted">
          Îți trimitem un email de fiecare dată când o lucrare e gata de arătat.
        </p>
      </div>
    </UCard>

    <template v-else>
      <div v-if="children.length > 1" class="flex gap-2 flex-wrap">
        <UButton
          :variant="childFilter === null ? 'solid' : 'outline'"
          size="sm"
          @click="childFilter = null"
        >
          Toți
        </UButton>
        <UButton
          v-for="child in children"
          :key="child.id"
          :variant="childFilter === child.id ? 'solid' : 'outline'"
          size="sm"
          @click="childFilter = child.id"
        >
          {{ child.firstName }}
        </UButton>
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="child in downloadableChildren"
          :key="child.id"
          icon="i-lucide-download"
          variant="outline"
          size="sm"
          :loading="downloading === child.id"
          @click="downloadArchive(child)"
        >
          Descarcă tot ({{ child.firstName }})
        </UButton>
      </div>

      <UCard v-for="project in visible" :key="project.id" class="border">
        <div class="flex gap-4">
          <ProjectThumbnail
            :project-id="project.id"
            :has-thumbnail="project.hasThumbnail"
            :alt="project.title"
            :size="112"
          />
          <div class="flex-1 min-w-0 space-y-2">
            <div>
              <p class="font-semibold">{{ project.title }}</p>
              <p class="text-sm text-muted">
                {{ project.child.firstName }} · {{ project.capturedOn }}
              </p>
            </div>
            <p v-if="project.description" class="text-sm">{{ project.description }}</p>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="file in filesOf(project)"
                :key="file.id"
                size="xs"
                variant="outline"
                icon="i-lucide-download"
                :loading="downloadingFile === file.id"
                @click="downloadFile(project.id, file.id)"
              >
                {{ file.originalName }}
              </UButton>
              <UButton
                v-for="link in project.links"
                :key="`link-${link.id}`"
                size="xs"
                variant="outline"
                icon="i-lucide-external-link"
                :to="link.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ link.label }}
              </UButton>
            </div>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import { useTokenStore } from "~/stores/tokenStore";
import type { Project, ProjectFile } from "~/types/project.types";

/**
 * The parent's gallery. E14/S5.
 *
 * **Only what has been sent appears here**, and that is enforced by the API rather than by this
 * page: a document still in review has not been looked at by anyone, and the portal must not be the
 * back door around the screen where somebody looks at it first.
 *
 * Downloads go through the backend, never straight to storage. The button asks for a signed URL,
 * the backend checks the child is this parent's, and the browser follows the URL it gets back. A
 * storage URL never appears in a page, an email or a log.
 */
definePageMeta({ layout: "dashboard" as any, title: "Proiectele copiilor" });

const { fetchProjects, fileDownloadUrl } = useProjectsApi();
const notifications = useNotifications();
const tokenStore = useTokenStore();
const config = useRuntimeConfig();

const loading = ref(true);
const loadError = ref<string | null>(null);
const projects = ref<Project[]>([]);
const childFilter = ref<number | null>(null);
const downloading = ref<number | null>(null);
const downloadingFile = ref<number | null>(null);

const children = computed(() => {
  const seen = new Map<number, { id: number; firstName: string }>();
  for (const project of projects.value) {
    seen.set(project.child.id, { id: project.child.id, firstName: project.child.firstName });
  }
  return [...seen.values()];
});

const downloadableChildren = computed(() =>
  childFilter.value === null
    ? children.value
    : children.value.filter((child) => child.id === childFilter.value)
);

const visible = computed(() =>
  childFilter.value === null
    ? projects.value
    : projects.value.filter((project) => project.child.id === childFilter.value)
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

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    projects.value = await fetchProjects();
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
async function downloadArchive(child: { id: number; firstName: string }) {
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
