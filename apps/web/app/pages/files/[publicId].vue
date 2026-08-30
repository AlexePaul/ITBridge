<template>
  <div class="w-full max-w-2xl mx-auto px-4 py-6 space-y-6">
    <UCard v-if="loadError" class="border border-error" variant="subtle">
      <p class="font-medium">{{ loadError }}</p>
      <p class="text-sm text-muted mt-2">
        Dacă ai primit linkul pe email și tot nu se deschide, scrie-ne și ne uităm noi.
      </p>
    </UCard>

    <div v-else-if="loading" class="py-12 text-center text-muted">Se încarcă…</div>

    <template v-else-if="project">
      <div>
        <UButton
          to="/user/proiecte"
          variant="link"
          color="neutral"
          icon="i-lucide-arrow-left"
          class="px-0"
        >
          Toate proiectele
        </UButton>
        <h1 class="text-3xl font-bold">{{ project.title }}</h1>
        <p class="text-muted mt-1">{{ project.child.firstName }} · {{ project.capturedOn }}</p>
      </div>

      <ProjectThumbnail
        :project-id="project.id"
        :has-thumbnail="project.hasThumbnail"
        :alt="project.title"
        :size="320"
      />

      <p v-if="project.description">{{ project.description }}</p>

      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="file in files"
          :key="file.id"
          icon="i-lucide-download"
          variant="outline"
          :loading="downloading === file.id"
          @click="download(file.id)"
        >
          {{ file.originalName }}
        </UButton>
        <UButton
          v-for="link in project.links"
          :key="`link-${link.id}`"
          icon="i-lucide-external-link"
          variant="outline"
          :to="link.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ link.label }}
        </UButton>
      </div>

      <!--
        E14/S7, the third mechanism: the parent reports, the parent does not delete. A file saved
        into the folder next to the right one is a disclosure of another family's data, and the
        person most likely to notice is the one who opened it.
      -->
      <UCard variant="subtle" class="border">
        <p class="text-sm text-muted">
          Nu pare lucrarea copilului tău?
          <UButton variant="link" class="px-1" @click="reportOpen = true">Spune-ne</UButton>
          și verificăm.
        </p>
      </UCard>
    </template>

    <UModal v-model:open="reportOpen" title="Semnalează o problemă">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm">
            Trimitem mesajul la școală. Nu ștergem nimic automat — ne uităm întâi.
          </p>
          <UFormField label="Ce nu e în regulă?" hint="Opțional">
            <UTextarea
              v-model="note"
              class="w-full"
              placeholder="Pare lucrarea altui copil din grupă…"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="reportOpen = false">Renunță</UButton>
          <UButton :loading="reporting" @click="submitReport">Trimite</UButton>
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
import type { Project } from "~/types/project.types";

/**
 * What the link in a parent's email opens. E14/S5.
 *
 * **It requires a login, and that is the decision.** A link that works without an account works for
 * whoever it gets forwarded to, and what opens is a named child's work. The extra step is paid once —
 * after the first sign-in the session holds — and it buys total control over who sees what.
 *
 * The identifier in the URL is random rather than the project's number. That is not the security
 * boundary, which is the ownership check in the backend; it is what stops the boundary from being
 * probed one integer at a time.
 */
definePageMeta({ layout: "dashboard" as any, title: "Lucrarea copilului" });

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
