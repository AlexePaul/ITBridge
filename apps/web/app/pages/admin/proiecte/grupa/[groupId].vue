<template>
  <div class="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <UButton
          to="/admin/proiecte"
          variant="link"
          color="neutral"
          icon="i-lucide-arrow-left"
          class="px-0"
        >
          Toate grupele
        </UButton>
        <h1 class="text-3xl font-bold">{{ groupName || "Grupă" }}</h1>
        <p class="text-muted mt-1">
          Uită-te la ce a urcat agentul, bifează ce e în regulă și trimite. Nimic nu pleacă singur.
        </p>
      </div>
      <UButton
        size="lg"
        :disabled="selected.size === 0 || sending"
        :loading="sending"
        @click="send"
      >
        Trimite ({{ selected.size }})
      </UButton>
    </div>

    <UCard v-if="loadError" class="border border-error" variant="subtle">
      <p class="font-medium">{{ loadError }}</p>
    </UCard>

    <div v-else-if="loading" class="py-12 text-center text-muted">Se încarcă…</div>

    <template v-else>
      <!--
        The nudge, and it is a read. E14 is explicit that attendance is never derived from files —
        a document proves somebody saved a file, not that a child was in the room — but the reverse
        is useful while the class is still there.
      -->
      <UCard v-if="withoutToday.length" variant="subtle" class="border">
        <p class="text-sm">
          <span class="font-medium">Fără niciun document azi:</span>
          {{ withoutToday.map((child) => child.firstName).join(", ") }}
        </p>
      </UCard>

      <UCard v-if="pending.length === 0 && sent.length === 0" variant="subtle" class="border">
        <div class="py-8 text-center space-y-2">
          <UIcon name="i-lucide-folder-open" class="text-3xl text-muted" />
          <p class="font-medium">Nimic încă pentru grupa asta.</p>
          <p class="text-sm text-muted">
            Documentele apar aici la câteva zeci de secunde după ce profesorul le salvează în
            folderul copilului.
          </p>
        </div>
      </UCard>

      <template v-if="pending.length">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold">De verificat ({{ pending.length }})</h2>
          <UButton size="xs" variant="ghost" @click="toggleAll">
            {{ allSelected ? "Deselectează tot" : "Selectează tot" }}
          </UButton>
        </div>

        <UCard v-for="project in pending" :key="project.id" class="border">
          <div class="flex gap-4">
            <UCheckbox
              :model-value="selected.has(project.id)"
              class="mt-1"
              @update:model-value="toggle(project.id)"
            />
            <ProjectThumbnail
              :project-id="project.id"
              :has-thumbnail="project.hasThumbnail"
              :alt="project.title"
            />
            <div class="flex-1 min-w-0 space-y-1">
              <p class="font-semibold truncate">{{ project.title }}</p>
              <p class="text-sm text-muted">
                {{ project.child.firstName }} {{ project.child.lastName }} ·
                {{ project.capturedOn }} · {{ PROJECT_SOURCE_LABELS[project.source] }}
              </p>
              <p class="text-xs text-muted truncate">
                {{ fileSummary(project) }}
              </p>
            </div>
            <div class="flex flex-col gap-1 shrink-0">
              <UButton size="xs" variant="ghost" @click="openReassign(project)">Alt copil</UButton>
              <UButton size="xs" variant="ghost" color="error" @click="openDelete(project)">
                Șterge
              </UButton>
            </div>
          </div>
        </UCard>
      </template>

      <template v-if="sent.length">
        <h2 class="text-xl font-semibold pt-2">Trimise ({{ sent.length }})</h2>
        <UCard v-for="project in sent" :key="project.id" class="border" variant="subtle">
          <div class="flex gap-4 items-center">
            <ProjectThumbnail
              :project-id="project.id"
              :has-thumbnail="project.hasThumbnail"
              :size="64"
              :alt="project.title"
            />
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">{{ project.title }}</p>
              <p class="text-sm text-muted truncate">
                {{ project.child.firstName }} · trimis la
                <span class="font-mono">{{ project.sentToEmail || "—" }}</span>
              </p>
            </div>
            <UButton size="xs" variant="ghost" @click="openReassign(project)">Alt copil</UButton>
          </div>
        </UCard>
      </template>
    </template>

    <UModal v-model:open="reassignOpen" title="Mută documentul la alt copil">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm">
            <span class="font-medium">{{ reassigning?.title }}</span> e acum al lui
            {{ reassigning?.child.firstName }} {{ reassigning?.child.lastName }}.
          </p>
          <!--
            The warning is only shown when it is true. A document still in review has left nowhere,
            and saying "the email has already gone" about it would teach an admin to skip the notice.
          -->
          <UCard v-if="reassigning?.sentAt" class="border border-warning" variant="subtle">
            <p class="text-sm">
              Emailul a plecat deja către
              <span class="font-mono">{{ reassigning?.sentToEmail }}</span
              >. Mută documentul și <strong>sună familia</strong> — un al doilea email care spune
              „ignorați ce ați primit" atrage atenția asupra lucrării mai mult decât un telefon.
            </p>
          </UCard>
          <UFormField label="Copilul căruia îi aparține">
            <USelect
              v-model="reassignChildId"
              :items="childOptions"
              value-key="value"
              class="w-full"
              placeholder="Alege copilul"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="reassignOpen = false">Renunță</UButton>
          <UButton :disabled="!reassignChildId" :loading="busy" @click="confirmReassign">
            Mută
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" title="Șterge documentul">
      <template #body>
        <p class="text-sm">
          Ștergi <span class="font-medium">{{ deleting?.title }}</span> și fișierele lui. Nu se
          poate anula.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="deleteOpen = false">Renunță</UButton>
          <UButton color="error" :loading="busy" @click="confirmDelete">Șterge</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="reportOpen" title="Ce s-a trimis">
      <template #body>
        <div class="space-y-3 text-sm">
          <p v-if="report?.queued.length">
            <span class="font-medium">{{ report.queued.length }}</span> {{ pluralParents }} primesc
            documentele copiilor lor.
          </p>
          <!--
            Undeliverable recipients are listed, never counted and dropped. A parent who does not
            receive their child's work does not receive their invoices either, and today nobody
            would find out.
          -->
          <div v-if="report?.undeliverable.length" class="space-y-1">
            <p class="font-medium text-warning">Nu au putut primi:</p>
            <p v-for="row in report.undeliverable" :key="row.parentId" class="text-muted">
              {{ row.parentName }} — {{ UNDELIVERABLE_REASON_LABELS[row.reason!] }}
            </p>
          </div>
          <div v-if="report?.skipped.length" class="space-y-1">
            <p class="font-medium">Sărite:</p>
            <p v-for="row in report.skipped" :key="row.projectId" class="text-muted">
              #{{ row.projectId }} — {{ SKIPPED_PROJECT_REASON_LABELS[row.reason] }}
            </p>
          </div>
          <p class="text-xs text-muted pt-2">
            Butonul confirmă că mesajele s-au pus la trimitere, nu că au ajuns.
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end w-full">
          <UButton @click="reportOpen = false">Am înțeles</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useChildrenStore } from "~/stores/childrenStore";
import { useNotifications } from "~/composables/useNotifications";
import { apiErrorMessage } from "~/composables/useApiError";
import {
  PROJECT_SOURCE_LABELS,
  SKIPPED_PROJECT_REASON_LABELS,
  UNDELIVERABLE_REASON_LABELS,
} from "~/types/project.types";
import type { Project, SendProjectsResult } from "~/types/project.types";
import type { Child } from "~/types/child.types";

/**
 * The review screen. E14/S4, and the reason there is a button rather than an evening job.
 *
 * Between a folder anything can land in and a parent's inbox, the only possible check that a
 * document belongs to the child whose name is on it is a pair of eyes. The screen is built for that
 * one act: a thumbnail big enough to recognise the work, the child's name next to it, and a way to
 * move a document to the right child before anything leaves.
 *
 * It is realistic because a group is about ten children. At a hundred rows the button would become
 * a formality pressed in a hurry, which is exactly what the evening job would have been.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Proiectele grupei",
});

const route = useRoute();
const groupId = Number(route.params.groupId);

const { fetchProjects, sendProjects, reassignProject, deleteProject, childrenWithoutProjects } =
  useProjectsApi();
const { fetchChildren } = useChildrenApi();
const childrenStore = useChildrenStore();
const notifications = useNotifications();

const loading = ref(true);
const loadError = ref<string | null>(null);
const projects = ref<Project[]>([]);
const withoutToday = ref<Child[]>([]);
const selected = ref(new Set<number>());
const sending = ref(false);
const busy = ref(false);

const reassignOpen = ref(false);
const reassigning = ref<Project | null>(null);
// `undefined`, not `null`: that is what USelect models an empty selection as.
const reassignChildId = ref<number | undefined>(undefined);
const deleteOpen = ref(false);
const deleting = ref<Project | null>(null);
const reportOpen = ref(false);
const report = ref<SendProjectsResult | null>(null);

const pending = computed(() => projects.value.filter((project) => project.status !== "sent"));
const sent = computed(() => projects.value.filter((project) => project.status === "sent"));
const groupName = computed(
  () =>
    projects.value[0]?.child.group?.name ??
    childrenStore.children.find((child) => child.group?.id === groupId)?.group?.name ??
    ""
);
const allSelected = computed(
  () => pending.value.length > 0 && pending.value.every((project) => selected.value.has(project.id))
);
const pluralParents = computed(() => (report.value?.queued.length === 1 ? "părinte" : "părinți"));

/**
 * Who a document can be moved to: every child in this group, not only the ones who already have
 * work here.
 *
 * The distinction matters on the day it matters. The first misfiled document of a term belongs to a
 * child with nothing uploaded yet, and a list built from the documents on screen would not contain
 * them — leaving the only correction available "delete it and ask the teacher to save it again".
 */
const childOptions = computed(() =>
  childrenStore.children
    .filter((child) => child.group?.id === groupId)
    .map((child) => ({ label: `${child.firstName} ${child.lastName}`, value: child.id }))
);

function fileSummary(project: Project): string {
  const files = project.versions
    .flatMap((version) => version.files)
    .map((file) => file.originalName);
  const links = project.links.map((link) => link.label);
  return [...files, ...links].join(", ") || "fără fișiere";
}

function toggle(id: number) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function toggleAll() {
  selected.value = allSelected.value
    ? new Set()
    : new Set(pending.value.map((project) => project.id));
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [loaded] = await Promise.all([fetchProjects({ groupId }), fetchChildren()]);
    projects.value = loaded;
    withoutToday.value = await childrenWithoutProjects(groupId, todayKey());
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function send() {
  sending.value = true;
  try {
    report.value = await sendProjects([...selected.value]);
    selected.value = new Set();
    reportOpen.value = true;
    await load();
  } catch (err) {
    notifications.error("Nu am putut trimite", apiErrorMessage(err));
  } finally {
    sending.value = false;
  }
}

function openReassign(project: Project) {
  reassigning.value = project;
  reassignChildId.value = undefined;
  reassignOpen.value = true;
}

async function confirmReassign() {
  if (!reassigning.value || !reassignChildId.value) return;
  busy.value = true;
  try {
    await reassignProject(reassigning.value.id, reassignChildId.value);
    reassignOpen.value = false;
    notifications.success("Documentul a fost mutat");
    await load();
  } catch (err) {
    notifications.error("Nu am putut muta documentul", apiErrorMessage(err));
  } finally {
    busy.value = false;
  }
}

function openDelete(project: Project) {
  deleting.value = project;
  deleteOpen.value = true;
}

async function confirmDelete() {
  if (!deleting.value) return;
  busy.value = true;
  try {
    await deleteProject(deleting.value.id);
    deleteOpen.value = false;
    notifications.success("Documentul a fost șters");
    await load();
  } catch (err) {
    notifications.error("Nu am putut șterge documentul", apiErrorMessage(err));
  } finally {
    busy.value = false;
  }
}

/**
 * Today, from the local components of the date.
 *
 * Not `toISOString().slice(0, 10)`: that is the UTC day, which in Romania is yesterday for anything
 * before 02:00 or 03:00. The mistake is exactly one day and it does not show up in review.
 */
function todayKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

onMounted(load);
</script>
