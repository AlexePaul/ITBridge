<template>
  <AdminPage
    :title="`Prezența · ${group?.name || `Grupa ${$route.params.groupId}`}`"
    :subtitle="scheduleLine"
    back-to="/admin/attendance"
    width="xl"
  >
    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <div class="w-1/3 mx-auto">
        <template v-for="child in children" :key="child.id">
          <UCard class="mb-4">
            <template #header>
              <div class="items-center justify-between flex">
                <div class="flex items-center gap-2">
                  <UBadge color="secondary" variant="subtle" size="lg" class="w-10 justify-center">
                    #{{ child.id }}
                  </UBadge>
                  <!--
                    E11/S4: a trial has to be visible in the register. The child is in the group and
                    is marked present or absent like anyone else — they are sitting there — but the
                    teacher should know this is somebody deciding whether to stay.
                  -->
                  <UBadge
                    v-if="trialChildIds.has(child.id)"
                    color="info"
                    variant="subtle"
                    size="sm"
                  >
                    Probă
                  </UBadge>
                </div>
                <template v-if="String(child?.group?.id) !== groupId">
                  <UButton
                    icon="i-lucide-x"
                    variant="ghost"
                    color="warning"
                    @click="removeChildFromList(child.id)"
                  />
                </template>
              </div>
            </template>
            <template #default>
              <div class="items-center justify-between flex">
                <span class="inline-block text-lg">{{
                  child.firstName + " " + child.lastName
                }}</span>
                <USwitch
                  unchecked-icon="i-lucide-x"
                  checked-icon="i-lucide-check"
                  class="inline-block"
                  size="lg"
                  color="success"
                  v-model="attendanceData[String(child.id)]"
                >
                  Prezent</USwitch
                >
              </div>
            </template>
          </UCard>
        </template>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">Adaugă copii de la alte grupe</h2>
          </template>
          <template #default>
            <div class="space-y-3 relative">
              <div>
                <UInput
                  v-model="searchQuery"
                  placeholder="Cauta copil dupa nume sau ID..."
                  icon="i-lucide-search"
                  color="primary"
                  class="w-full"
                />
              </div>
            </div>
            <!--
              Adaugă un copil în catalog, deci e un buton — nu un card cu `@click`, care nu se
              poate nici focusa, nici apăsa cu Enter (E18/S6).
            -->
            <template v-for="child in filteredChildren">
              <UCard
                as="button"
                type="button"
                class="mt-2 w-full text-left"
                @click="addChildToList(child)"
              >
                <div class="items-center justify-between flex">
                  <span class="inline-block text-lg">{{
                    child.firstName + " " + child.lastName
                  }}</span>
                  <UBadge color="secondary" variant="subtle" size="md" class="w-10 justify-center">
                    #{{ child.id }}
                  </UBadge>
                </div>
              </UCard>
            </template>
          </template>
        </UCard>
        <!-- Dropdown Results (outside card) -->
      </div>
    </template>
    <template #footer>
      <div class="flex items-end gap-4 w-1/2 mx-auto mt-4">
        <div class="flex-1">
          <label class="text-sm font-semibold mb-2 block">Ora de curs</label>
          <USelectMenu
            v-model="selectedSessionId"
            :items="sessionOptions"
            value-key="value"
            label-key="label"
            placeholder="Selectează ora de curs..."
            class="w-full"
          />
          <div v-if="sessionOptions.length === 0" class="mt-2 space-y-2">
            <p class="text-sm text-warning">
              Grupa nu are ore programate fără prezență înregistrată. Generează-i orarul chiar de
              aici, pentru ultimele 4 săptămâni și pentru următoarele 8.
            </p>
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-calendar-plus"
              :loading="isGeneratingSchedule"
              :disabled="isGeneratingSchedule"
              @click="handleGenerateSchedule"
            >
              Generează orarul grupei
            </UButton>
            <p class="text-xs text-muted">
              Poți apăsa liniștit de mai multe ori: orele care există deja rămân neatinse, iar cele
              anulate nu sunt reînviate.
            </p>
          </div>
        </div>
        <UModal title="Confirmare Salvare Prezență">
          <UButton class="ml-auto" color="primary" size="lg" :disabled="!selectedSessionId">
            Salvează Prezența
          </UButton>
          <template #body>
            <div class="space-y-4">
              <p class="text-lg">
                Ești sigur că dorești să salvezi prezența pentru grupa
                {{ group?.name || group?.id }} la ora de curs {{ selectedSessionLabel }}?
              </p>
              <div class="flex gap-3 pt-2">
                <UButton
                  type="button"
                  size="lg"
                  class="flex-1 justify-center"
                  variant="solid"
                  @click="handleSubmit"
                  >Confirmă</UButton
                >
              </div>
            </div>
          </template>
        </UModal>
      </div>
    </template>
  </AdminPage>
</template>
<script setup lang="ts">
import { apiErrorMessage } from "~/composables/useApiError";
import { useNotifications } from "~/composables/useNotifications";
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { DEFAULT_HORIZON_WEEKS, useClassSessionsApi } from "~/composables/api/useClassSessionsApi";
import { useGroupsApi } from "~/composables/api/useGroupsApi";
import { generatedScheduleMessage } from "~/composables/useClassSessionSchedule";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import { useChildrenStore } from "~/stores/childrenStore";
import { useEnrollmentsApi } from "~/composables/api/useEnrollmentsApi";
import { useGroupsStore } from "~/stores/groupsStore";
import type { Child } from "~/types/child.types";
import type { Group } from "~/types/group.types";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";
import { SessionStatus } from "~/types/class-session.types";

const route = useRoute();
const childrenStore = useChildrenStore();
const childrenApi = useChildrenApi();
const enrollmentsApi = useEnrollmentsApi();
const children: Ref<Child[]> = ref([]);

/**
 * Which of the children in the register are on a trial.
 *
 * Read from the enrolments rather than inferred from the child, because "on trial" is a property of
 * the enrolment, not of the person — the same child can be a trial in September and enrolled in
 * October.
 */
const trialChildIds = ref<Set<number>>(new Set());
const searchQuery = ref("");
const availableChildren: Ref<Child[]> = ref([]);
const groupsStore = useGroupsStore();
const groupsApi = useGroupsApi();
const group = ref<Group>();
const loading = ref(true);
const loadError = ref<string | null>(null);

/** The day, hour and room, as one line under the title. */
const scheduleLine = computed(() => {
  const day = getWeekdayName(group.value?.weekday as number);
  const from = formatTime(group.value?.startTime ?? "00:00:00");
  const to = formatTime(group.value?.endTime ?? "23:59:59");
  const room = group.value?.room;
  const where = room ? ` · ${room.location.name} · ${room.name}` : "";
  return `${day}, ${from} - ${to}${where}`;
});
const attendanceData = reactive<Record<string, boolean>>({});
const attendanceApi = useAttendanceApi();
const classSessionsApi = useClassSessionsApi();
const sessions: Ref<ClassSessionWithAttendance[]> = ref([]);
const selectedSessionId = ref<number | undefined>(undefined);
const isGeneratingSchedule = ref(false);

/** How far back the picker looks. Beyond this, a forgotten register is a data-entry job, not a screen. */
const SESSION_WINDOW_DAYS = 28;

const groupId = computed(() => route.params.groupId as string);

/**
 * Local calendar day, not `toISOString().slice(0, 10)`.
 *
 * The API compares these against `date` columns written from local components, and UTC midnight is
 * the previous day for everyone west of Greenwich — the same trap `class-session.dates.ts` is built
 * to avoid on the server.
 */
const isoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const addDays = (date: Date, days: number): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/**
 * The classes this register can be taken for: not cancelled, and not already marked.
 *
 * Marked ones are dropped because the API refuses them outright with a 409 — one mark per child per
 * class — so offering them would be offering an error. Most recent first: the register is nearly
 * always taken for the class that has just finished.
 */
const sessionOptions = computed(() =>
  sessions.value
    .filter((session) => session.status !== SessionStatus.CANCELLED && !session.hasAttendance)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
    .map((session) => ({
      value: session.id,
      label: `${new Date(session.date).toLocaleDateString("ro-RO", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      })} · ${formatTime(session.startTime)}`,
    }))
);

const selectedSessionLabel = computed(
  () => sessionOptions.value.find((option) => option.value === selectedSessionId.value)?.label ?? ""
);

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Înregistrarea Prezenței pe Grup",
});

/**
 * The search results, derived rather than kept — and the difference was a whole keystroke.
 *
 * This was a `ref` filled by `@input="filterChildren"` on the `UInput`, which looks right and is
 * not: Vue merges a listener passed through `$attrs` with the component's own, **ours first**, so
 * `filterChildren` ran before `v-model` had written the character just typed. The list was
 * therefore always one keystroke behind. Measured on seed data: typing `a` matched nothing (it
 * filtered on the empty string and cleared the list), `aa` returned eleven children (it filtered on
 * `a`), `aaa` returned nothing again. A teacher typing a whole name saw an empty list, because the
 * last letter had not arrived yet — and nothing about the screen suggested the name was the
 * problem.
 *
 * A `computed` cannot be out of step with what it reads. Same reason `isProfileComplete` and
 * `isAccountActive` are derived on the backend: a second copy of a value is free to disagree with
 * the first.
 */
const filteredChildren = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return [];
  return availableChildren.value.filter(
    (child) =>
      child.firstName.toLowerCase().includes(query) ||
      child.lastName.toLowerCase().includes(query) ||
      String(child.id).includes(query)
  );
});

const addChildToList = (child: Child) => {
  // Avoid duplicates
  if (!children.value.some((c) => c.id === child.id)) {
    children.value.push(child);
    attendanceData[String(child.id)] = true; // Initialize as present
  }
  // Remove from available list
  availableChildren.value = availableChildren.value.filter((c) => c.id !== child.id);
  // Clearing the query empties the results on its own, now that they are derived from it.
  searchQuery.value = "";
};

const removeChildFromList = (childId: number) => {
  children.value = children.value.filter((c) => c.id !== childId);
  delete attendanceData[String(childId)];
  availableChildren.value.push(childrenStore.getChildById(childId) as Child);
};

/**
 * The classes this screen can take a register for, and the selection that follows from them.
 *
 * Called again after generating, so the picker fills in without a page reload - the whole point of
 * putting the button in the empty state.
 */
const loadSessions = async () => {
  const today = new Date();
  sessions.value = await classSessionsApi.fetchSessions({
    groupId: parseInt(groupId.value),
    dateFrom: isoDate(addDays(today, -SESSION_WINDOW_DAYS)),
    // Today, not the end of the window: a register is taken after the class, and offering next
    // week's classes invites marking one before it has happened.
    dateTo: isoDate(today),
  });

  // The most recent unmarked class, which is the one the teacher has just taught. `sessionOptions`
  // is already newest-first, so that is the head of the list.
  selectedSessionId.value = sessionOptions.value[0]?.value;
};

/**
 * The register, and the five awaits that used to have nothing around them.
 *
 * Every one of these was awaited bare in `onMounted`, so a failed request was an unhandled
 * rejection at mount: not an empty register, the whole app on Nuxt's error page. The trial-badge
 * call below already had its own `catch` and keeps it, for the reason written next to it.
 */
const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    await childrenApi.fetchChildren();
    children.value = await childrenStore.getChildrenByGroupId(groupId.value);
    availableChildren.value = await childrenStore.getChildrenNotInGroupId(groupId.value);
    await groupsApi.fetchGroups();
    group.value = groupsStore.getGroupById(groupId.value as string);
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca grupa.");
    return;
  } finally {
    loading.value = false;
  }

  try {
    const members = await enrollmentsApi.fetchMembers(Number(groupId.value));
    trialChildIds.value = new Set(
      (members ?? [])
        .filter((entry) => entry.status === "TRIAL")
        .map((entry) => entry.child?.id ?? -1)
    );
  } catch {
    // The register still works without the badges; a missing badge is better than a blank page.
    trialChildIds.value = new Set();
  }

  // Initialize attendance data map with all group children
  children.value.forEach((child) => {
    attendanceData[String(child.id)] = true; // Default to present
  });

  await loadSessions();
};

onMounted(load);

const { success, error } = useNotifications();

/**
 * Generates this group's timetable, from where the admin is actually blocked.
 *
 * The horizon starts at the beginning of the picker's own window, not today, and that is the whole
 * point: an admin lands here to record a register for a class that has already happened, and a
 * run that only writes future classes would leave the picker just as empty as it found it. Four
 * weeks back fills exactly what this screen can offer, and `DEFAULT_HORIZON_WEEKS` on top leaves
 * the group with the same eight weeks ahead that generating from the groups page would give it.
 *
 * Safe to repeat: the API is idempotent by (group, day), so a second press writes nothing and
 * cannot resurrect a cancelled class.
 */
const handleGenerateSchedule = async () => {
  isGeneratingSchedule.value = true;
  try {
    const result = await classSessionsApi.generateSessions({
      groupId: parseInt(groupId.value),
      from: isoDate(addDays(new Date(), -SESSION_WINDOW_DAYS)),
      weeks: SESSION_WINDOW_DAYS / 7 + DEFAULT_HORIZON_WEEKS,
    });
    await loadSessions();
    success(generatedScheduleMessage(result));
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut genera orarul grupei."));
  } finally {
    isGeneratingSchedule.value = false;
  }
};

const handleSubmit = async () => {
  // A group with nobody in it has nothing to record, and the API refuses an empty list outright
  // (`@ArrayNotEmpty`). Caught here so the teacher gets a sentence rather than an unhandled
  // rejection and a page that simply does not move.
  if (children.value.length === 0) {
    error("Grupa nu are niciun copil, deci nu există prezență de salvat.");
    return;
  }

  // The class is named, not described. Without one there is nothing to post against, and the old
  // free-typed date and hour are exactly what the API stopped accepting.
  if (!selectedSessionId.value) {
    error("Alege ora de curs pentru care salvezi prezența.");
    return;
  }

  const submissionData = {
    childrenAttendance: children.value.map((child) => ({
      childId: child.id,
      present: attendanceData[String(child.id)] ?? true,
    })),
  };

  try {
    await attendanceApi.markSessionAttendance(selectedSessionId.value, submissionData);
    success("Prezența a fost salvată");
    navigateTo("/admin/attendance/group");
  } catch (err: unknown) {
    error(apiErrorMessage(err, "Nu am putut salva prezența."));
  }
};
</script>
