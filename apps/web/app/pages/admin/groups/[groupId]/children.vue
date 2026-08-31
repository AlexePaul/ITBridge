<template>
  <div class="w-full max-w-7xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-3xl font-bold">Gestionează Copii</h1>
        <p class="text-muted mt-1">{{ subtitle }}</p>
      </div>
      <UButton
        color="secondary"
        variant="subtle"
        class="mr-3 ml-auto flex items-center h-11"
        size="lg"
        @click="handleBack"
      >
        <UIcon name="i-lucide-arrow-left" class="mr-2" />
        Înapoi
      </UButton>
    </div>

    <div v-if="group" class="space-y-8">
      <!--
        Occupancy comes from the server, not from `childrenInGroup.length`. The two differ the
        moment a trial is booked: a trial holds a seat (D7) without the child appearing in the list
        below, so a number counted here would tell an admin a group has room when it does not.
      -->
      <UCard v-if="occupancy" class="border" variant="subtle">
        <div class="flex flex-col sm:flex-row sm:items-center gap-4">
          <div class="flex items-center gap-3 flex-1">
            <UIcon
              :name="occupancy.free > 0 ? 'i-lucide-armchair' : 'i-lucide-user-x'"
              class="text-2xl"
              :class="occupancy.free > 0 ? 'text-success' : 'text-warning'"
            />
            <div>
              <p class="font-bold text-lg">
                {{ occupancy.taken }} din {{ occupancy.capacity }} locuri ocupate
              </p>
              <p class="text-sm text-muted">
                {{
                  occupancy.free > 0
                    ? `${occupancy.free} ${occupancy.free === 1 ? "loc liber" : "locuri libere"}`
                    : "Grupa este plină. Copiii noi merg pe lista de așteptare."
                }}
                <template v-if="occupancy.taken !== childrenInGroup.length">
                  · include {{ occupancy.taken - childrenInGroup.length }} probă/probe programate
                </template>
              </p>
            </div>
          </div>
          <UBadge v-if="occupancy.waiting > 0" color="warning" variant="subtle" size="lg">
            {{ occupancy.waiting }} pe listă
          </UBadge>
        </div>
      </UCard>

      <!-- Children in Group Section -->
      <UCard class="hover:shadow-lg transition-shadow">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-users" class="text-primary" />
            <h2 class="text-2xl font-bold">Copii în Grup</h2>
            <UBadge color="primary" variant="subtle">
              {{ childrenInGroup.length }}
            </UBadge>
          </div>
        </template>

        <div v-if="childrenInGroup.length > 0" class="space-y-3">
          <div
            v-for="child in childrenInGroup"
            :key="child.id"
            class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div>
              <UBadge variant="subtle" color="secondary" class="w-10 justify-center"
                >#{{ child.id }}</UBadge
              >
              <p class="font-semibold">{{ child.firstName }} {{ child.lastName }}</p>
            </div>
            <UButton
              color="info"
              variant="soft"
              size="sm"
              icon="i-lucide-minus"
              @click="handleRemoveChild(child.id)"
            >
              Elimină
            </UButton>
          </div>
        </div>

        <div v-else class="text-center py-8">
          <UIcon name="i-lucide-inbox" class="mx-auto text-4xl text-muted mb-3" />
          <p class="text-muted">Nu sunt copii în acest grup</p>
        </div>
      </UCard>

      <!-- Add Children Section -->
      <UCard class="hover:shadow-lg transition-shadow">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-plus" class="text-secondary" />
            <h2 class="text-2xl font-bold">Adaugă Copii</h2>
            <UBadge color="secondary" variant="subtle">
              {{ childrenWithoutGroup.length }}
            </UBadge>
          </div>
        </template>

        <div v-if="childrenWithoutGroup.length > 0" class="space-y-3">
          <div
            v-for="child in childrenWithoutGroup"
            :key="child.id"
            class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div>
              <UBadge variant="subtle" color="secondary" class="w-10 justify-center"
                >#{{ child.id }}</UBadge
              >
              <p class="font-semibold">{{ child.firstName }} {{ child.lastName }}</p>
            </div>
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-plus"
              @click="handleAddChild(child.id)"
            >
              Adaugă
            </UButton>
          </div>
        </div>

        <div v-else class="text-center py-8">
          <UIcon name="i-lucide-check-circle" class="mx-auto text-4xl text-success mb-3" />
          <p class="text-muted">Toți copii sunt asignați unui grup</p>
        </div>
      </UCard>

      <!-- Waiting list -->
      <UCard v-if="waitlist.length > 0" class="hover:shadow-lg transition-shadow">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-clock" class="text-warning" />
            <h2 class="text-2xl font-bold">Listă de așteptare</h2>
            <UBadge color="warning" variant="subtle">{{ waitlist.length }}</UBadge>
          </div>
        </template>

        <p class="text-sm text-muted mb-4">
          În ordinea în care s-a cerut. Când se eliberează un loc, îl oferim automat primului de pe
          listă și îi trimitem un email.
        </p>

        <div class="space-y-3">
          <div
            v-for="(entry, index) in waitlist"
            :key="entry.id"
            class="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
          >
            <div class="flex items-center gap-3">
              <UBadge variant="subtle" color="secondary" class="w-8 justify-center">
                {{ index + 1 }}
              </UBadge>
              <div>
                <p class="font-semibold">
                  {{ entry.child?.firstName }} {{ entry.child?.lastName }}
                  <UBadge
                    :color="entry.status === 'OFFERED' ? 'warning' : 'neutral'"
                    variant="subtle"
                    size="sm"
                    class="ml-2"
                  >
                    {{ WAITLIST_STATUS_LABELS[entry.status] }}
                  </UBadge>
                </p>
                <p v-if="entry.note" class="text-sm text-muted">{{ entry.note }}</p>
                <p v-if="entry.respondBy" class="text-sm text-warning">
                  Așteptăm răspuns până pe {{ formatDeadline(entry.respondBy) }}
                </p>
              </div>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-x"
              @click="handleRemoveFromWaitlist(entry.id)"
            >
              Scoate
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Save Changes -->
      <div class="flex gap-3 justify-center">
        <UButton color="primary" variant="subtle" size="md" class="w-40" @click="handleSaveChanges">
          Salvează Modificări
        </UButton>
        <UButton color="primary" variant="outline" size="md" class="w-40" @click="handleBack">
          Anulare
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <UCard v-else class="hover:shadow-lg transition-shadow">
      <div class="flex justify-center items-center py-8">
        <UIcon name="i-lucide-loader" class="animate-spin mr-2" />
        <span>Se încarcă...</span>
      </div>
    </UCard>

    <UModal v-model:open="warningOpen" title="Confirmi înscrierea?">
      <template #body>
        <p>{{ warningMessage }}</p>
        <p class="text-sm text-muted mt-3">
          Poți continua — e un avertisment, nu o interdicție. Capacitatea sălii rămâne verificată
          separat.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="warningOpen = false">Renunță</UButton>
          <UButton color="primary" @click="confirmWarning">Înscrie oricum</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { useNotifications } from "~/composables/useNotifications";
import { useGroupsStore } from "~/stores/groupsStore";
import { useChildrenStore } from "~/stores/childrenStore";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { useEnrollmentsApi } from "~/composables/api/useEnrollmentsApi";
import { apiErrorCode, apiErrorMessage } from "~/composables/useApiError";
import type { Group } from "~/types/group.types";
import type { Child } from "~/types/child.types";
import type { GroupOccupancy, WaitlistEntry } from "~/types/enrollment.types";
import { WAITLIST_STATUS_LABELS } from "~/types/enrollment.types";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionează Copii",
});

const route = useRoute();
const { success, error } = useNotifications();
const groupsStore = useGroupsStore();
const childrenStore = useChildrenStore();
const childrenApi = useChildrenApi();
const groupsApi = useGroupsApi();
const enrollmentsApi = useEnrollmentsApi();

const group: Ref<Group | null> = ref(null);
const childrenInGroup: Ref<Child[]> = ref([]);
const childrenWithoutGroup: Ref<Child[]> = ref([]);
const occupancy: Ref<GroupOccupancy | null> = ref(null);
const waitlist: Ref<WaitlistEntry[]> = ref([]);
const isLoading = ref(false);

const warningOpen = ref(false);
const warningMessage = ref("");
const warningChildId = ref<number | null>(null);

/** "12.09.2026, ora 14:00" — the same shape as the deadline in the offer email. */
const formatDeadline = (value: string) =>
  new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

/**
 * Occupancy and the queue, re-read after anything that could change either.
 *
 * Kept as one call rather than adjusted by hand after each action: the number depends on trials the
 * page never lists, so incrementing a local counter would drift the first time somebody books one.
 */
const refreshSeats = async (groupId: number) => {
  try {
    const [seats, queue] = await Promise.all([
      enrollmentsApi.fetchOccupancy(groupId),
      enrollmentsApi.fetchWaitlist(groupId),
    ]);
    occupancy.value = seats;
    waitlist.value = queue ?? [];
  } catch {
    // The rest of the page still works without these; showing a wrong number would be worse than
    // showing none.
    occupancy.value = null;
  }
};

/** "Adaugă sau elimină copii din Scratch Începători · Drumul Taberei · Sala 1". */
const subtitle = computed(() => {
  const current = group.value;
  if (!current) return "Adaugă sau elimină copii din grup";
  const where = current.room ? ` · ${current.room.location.name} · ${current.room.name}` : "";
  return `Adaugă sau elimină copii din ${current.name}${where}`;
});

onMounted(async () => {
  const groupId = route.params.groupId as string;

  // Both stores are filled by the lists this page is normally reached from, but a hard load
  // straight onto this URL arrives with them empty — and the page then reported "Grupul nu a fost
  // găsit" for a group that exists, and bounced back to the list.
  try {
    if (groupsStore.groups.length === 0) await groupsApi.fetchGroups();
    if (childrenStore.children.length === 0) await childrenApi.fetchChildren();
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la încărcarea grupului"));
  }

  group.value = groupsStore.getGroupById(groupId) || null;

  if (group.value) {
    childrenInGroup.value = childrenStore.getChildrenByGroupId(groupId);
    childrenWithoutGroup.value = childrenStore.getChildrenWithoutGroup();
    await refreshSeats(Number(groupId));
  } else {
    error("Grupul nu a fost găsit");
    navigateTo("/admin/groups");
  }
});

const handleBack = () => {
  navigateTo("/admin/groups");
};

const handleAddChild = async (childId: number, acknowledgeWarnings = false) => {
  try {
    isLoading.value = true;
    const groupId = group.value?.id as string | number;
    await childrenApi.addChildToGroup(childId, String(groupId), acknowledgeWarnings);

    // Move child from without group to in group (for UI)
    const childIndex = childrenWithoutGroup.value.findIndex((c) => c.id === childId);
    if (childIndex !== -1) {
      const child = childrenWithoutGroup.value.splice(childIndex, 1)[0];
      childrenInGroup.value.push(child as Child);
    }
    await refreshSeats(Number(groupId));
    success("Copil adăugat la grup");
  } catch (err: unknown) {
    // E11/S6 refuses once with the ages named and accepts on the retry, so this is where the
    // question gets asked. A warning that could not be answered would be a block wearing the wrong
    // word; a warning answered silently would be no check at all.
    if (apiErrorCode(err) === "COMPATIBILITY_WARNINGS") {
      warningChildId.value = childId;
      warningMessage.value = apiErrorMessage(err);
      warningOpen.value = true;
      return;
    }
    // The API names the rest — a full group, a child already enrolled elsewhere, a family still
    // waiting for approval — and `useApiError` has the Romanian sentence for each.
    error(apiErrorMessage(err, "Eroare la adăugarea copilului"));
  } finally {
    isLoading.value = false;
  }
};

const confirmWarning = async () => {
  const childId = warningChildId.value;
  warningOpen.value = false;
  if (childId !== null) await handleAddChild(childId, true);
};

const handleRemoveChild = async (childId: number) => {
  try {
    isLoading.value = true;
    const groupId = group.value?.id as string | number;
    await childrenApi.removeChildFromGroup(childId, String(groupId));

    // Move child from in group to without group (for UI)
    const childIndex = childrenInGroup.value.findIndex((c) => c.id === childId);
    if (childIndex !== -1) {
      const child = childrenInGroup.value.splice(childIndex, 1)[0];
      childrenWithoutGroup.value.push(child as Child);
    }
    await refreshSeats(Number(groupId));
    success("Copil eliminat din grup");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la eliminarea copilului"));
  } finally {
    isLoading.value = false;
  }
};

const handleRemoveFromWaitlist = async (entryId: number) => {
  try {
    isLoading.value = true;
    await enrollmentsApi.removeFromWaitlist(entryId);
    await refreshSeats(Number(group.value?.id));
    success("Cererea a fost scoasă de pe listă");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Eroare la scoaterea de pe listă"));
  } finally {
    isLoading.value = false;
  }
};

const handleSaveChanges = () => {
  success("Modificări salvate cu succes");
  navigateTo("/admin/groups");
};
</script>
