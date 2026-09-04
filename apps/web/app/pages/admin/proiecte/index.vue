<template>
  <div class="w-full max-w-5xl mx-auto px-4 py-6 space-y-6">
    <div>
      <h1 class="text-3xl font-bold">Proiectele elevilor</h1>
      <p class="text-muted mt-1">
        Agentul urcă ce salvează profesorii în folderele copiilor. Tu te uiți și trimiți.
      </p>
    </div>

    <!--
      The agent banner is the first thing on the screen, not a detail at the bottom. A single agent
      on a single office computer fails by going quiet, and silence looks exactly like a day when
      nobody built anything — so the interface has to say which of the two it is looking at.
    -->
    <UCard v-if="agentWarning" class="border border-warning" variant="subtle">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-triangle-alert" class="text-xl text-warning mt-0.5" />
        <div>
          <p class="font-medium">{{ agentWarning.title }}</p>
          <p class="text-sm text-muted mt-1">{{ agentWarning.detail }}</p>
        </div>
      </div>
    </UCard>

    <UCard v-else-if="agents.length" variant="subtle" class="border">
      <div class="flex items-center gap-3">
        <UIcon name="i-lucide-check-circle" class="text-xl text-success" />
        <p class="text-sm">
          Agentul <span class="font-medium">{{ agents[0]?.agentName }}</span> a raportat
          {{ lastSeenLabel(agents[0]!)
          }}<template v-if="agents[0]?.pendingFiles">
            , cu {{ agents[0]?.pendingFiles }} fișiere în așteptare</template
          >.
        </p>
      </div>
    </UCard>

    <UCard v-if="unassigned.length" class="border border-warning" variant="subtle">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold">Fișiere neatribuite</span>
          <UBadge color="warning" variant="subtle">{{ unassigned.length }}</UBadge>
        </div>
      </template>
      <p class="text-sm text-muted mb-3">
        Agentul le-a mutat în <span class="font-mono">_neatribuite</span> și le-a lăsat pe disc.
        Nimic nu s-a pierdut — trebuie doar să decidă cineva al cui e fișierul.
      </p>
      <div v-for="file in unassigned" :key="file.id" class="py-2 border-t flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">{{ file.fileName }}</p>
          <p class="text-xs text-muted truncate font-mono">{{ file.relativePath }}</p>
          <p class="text-xs text-warning mt-0.5">
            {{ UNASSIGNED_FILE_REASON_LABELS[file.reason] }}
          </p>
        </div>
        <UButton size="xs" variant="ghost" :loading="resolving === file.id" @click="resolve(file)">
          Am rezolvat
        </UButton>
      </div>
    </UCard>

    <UCard v-if="loadError" class="border border-error" variant="subtle">
      <p class="font-medium">{{ loadError }}</p>
    </UCard>

    <div v-else-if="loading" class="py-12 text-center text-muted">Se încarcă…</div>

    <UCard v-else-if="groups.length === 0" variant="subtle" class="border">
      <p class="py-8 text-center text-muted">Nu există grupe active.</p>
    </UCard>

    <div v-else class="grid gap-3 sm:grid-cols-2">
      <UCard
        v-for="group in groups"
        :key="group.id"
        class="border hover:border-primary transition-colors cursor-pointer"
        @click="open(group.id)"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="font-semibold truncate">{{ group.name }}</p>
            <p class="text-sm text-muted truncate">
              {{ group.room?.location?.name }} · {{ group.room?.name }}
            </p>
          </div>
          <!--
            The count and the age together, because neither says enough alone: five uploaded this
            afternoon is a normal afternoon, one from Tuesday still here on Friday is the thing
            E17/S8 is worried about. The colour changes at the line the API publishes.
          -->
          <div v-if="waiting(group.id)" class="shrink-0 text-right">
            <UBadge
              :color="groupIsStale(group.id) ? 'warning' : 'primary'"
              variant="subtle"
              size="lg"
            >
              {{ waiting(group.id)!.count }} noi
            </UBadge>
            <p class="text-xs mt-1" :class="groupIsStale(group.id) ? 'text-warning' : 'text-muted'">
              {{ ageLabel(waiting(group.id)!.oldestDays) }}
            </p>
          </div>
          <UBadge v-else color="neutral" variant="subtle">—</UBadge>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useProjectsApi } from "~/composables/api/useProjectsApi";
import { isAgentStale, lastSeenLabel, useAgentApi } from "~/composables/api/useAgentApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useGroupsStore } from "~/stores/groupsStore";
import { apiErrorMessage } from "~/composables/useApiError";
import { useNotifications } from "~/composables/useNotifications";
import { usePendingProjectsStore } from "~/stores/pendingProjectsStore";
import { UNASSIGNED_FILE_REASON_LABELS } from "~/types/project.types";
import type { AgentStatus, UnassignedFile } from "~/types/project.types";

/**
 * The way in to E14: which groups have documents waiting, whether the agent is alive, and what it
 * could not place.
 *
 * The counts are of documents in `nou` — the ones nobody has looked at. E17 names the risk this
 * screen answers: what depends on a button does not happen if nobody presses it, and the way to
 * close that is visibility rather than discipline.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Proiectele elevilor",
});

const router = useRouter();
const { fetchPendingProjects } = useProjectsApi();
const { fetchStatuses, fetchUnassigned, resolveUnassigned } = useAgentApi();
const { fetchGroups } = useGroupsApi();
const groupsStore = useGroupsStore();
const notifications = useNotifications();

const loading = ref(true);
const loadError = ref<string | null>(null);
const agents = ref<AgentStatus[]>([]);
const unassigned = ref<UnassignedFile[]>([]);
/**
 * Shared with the menu badge in the dashboard layout — E17/S8.
 *
 * One store, so the number beside "Proiecte" in the sidebar and the numbers on these cards cannot
 * disagree; and refreshed here after a send, because this screen is where the backlog shrinks.
 */
const pendingProjects = usePendingProjectsStore();

const waiting = (groupId: number) => pendingProjects.forGroup(groupId);

const groupIsStale = (groupId: number) => {
  const entry = pendingProjects.forGroup(groupId);
  const after = pendingProjects.summary?.staleAfterDays;
  return entry !== null && after !== undefined && entry.oldestDays >= after;
};

/** „de azi" / „de ieri" / „de 3 zile" — the sentence an admin is actually counting in. */
const ageLabel = (days: number) => {
  if (days === 0) return "de azi";
  if (days === 1) return "de ieri";
  return `de ${days} zile`;
};
const resolving = ref<number | null>(null);

const groups = computed(() => groupsStore.groups.filter((group) => group.isActive));

/**
 * What the banner says, or nothing at all.
 *
 * Two different problems with two different fixes: an agent that has stopped reporting, and one that
 * reported an error on its last pass. Never having heard from any agent is a third — on a fresh
 * install it is simply not set up yet, which is worth saying rather than leaving the screen silent.
 */
const agentWarning = computed(() => {
  if (agents.value.length === 0) {
    return {
      title: "Niciun agent nu a raportat vreodată",
      detail:
        "Fișierele salvate în folderele copiilor nu ajung nicăieri până când agentul nu rulează pe calculatorul din birou.",
    };
  }
  const stale = agents.value.find((agent) => isAgentStale(agent));
  if (stale) {
    return {
      title: `Agentul ${stale.agentName} nu a mai raportat de ${lastSeenLabel(stale)}`,
      detail:
        "Calculatorul din birou e probabil oprit. Fișierele rămân în folder și urcă atunci când agentul revine — dar până atunci lipsa lor nu înseamnă că nu a lucrat nimeni.",
    };
  }
  const failing = agents.value.find((agent) => agent.lastError);
  if (failing) {
    return {
      title: `Agentul ${failing.agentName} raportează o eroare`,
      detail: failing.lastError!,
    };
  }
  return null;
});

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    // Groups first: without them the counts have nothing to attach to. The other three are
    // independent of each other and of the order they arrive in.
    await fetchGroups();
    const [statuses, strays, pending] = await Promise.all([
      fetchStatuses(),
      fetchUnassigned(),
      // Asked of the server rather than tallied here from every `new` project — E17/S8. Counting in
      // the browser was a second definition of the figure the menu badge and the dashboard also
      // show, it could not produce an age, and it downloaded the whole backlog to measure it.
      fetchPendingProjects(),
    ]);

    agents.value = statuses;
    unassigned.value = strays;
    pendingProjects.set(pending);
  } catch (err) {
    loadError.value = apiErrorMessage(err);
  } finally {
    loading.value = false;
  }
}

async function resolve(file: UnassignedFile) {
  resolving.value = file.id;
  try {
    await resolveUnassigned(file.id);
    unassigned.value = unassigned.value.filter((candidate) => candidate.id !== file.id);
  } catch (err) {
    notifications.error("Nu am putut marca fișierul", apiErrorMessage(err));
  } finally {
    resolving.value = null;
  }
}

function open(groupId: number) {
  void router.push(`/admin/proiecte/grupa/${groupId}`);
}

onMounted(load);
</script>
