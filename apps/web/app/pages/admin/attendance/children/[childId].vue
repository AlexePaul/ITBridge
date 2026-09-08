<template>
  <AdminPage
    :title="child ? `${child.firstName} ${child.lastName}` : 'Prezența copilului'"
    subtitle="Istoricul prezenței"
    back-to="/admin/attendance/children"
  >
    <AdminLoading v-if="loading" />

    <AdminError v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <!-- Child Info Card -->
      <UCard v-if="child" class="bg-primary/5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p class="text-sm text-muted">ID</p>
            <p class="font-semibold text-lg">#{{ child.id }}</p>
          </div>
          <div>
            <p class="text-sm text-muted">Data Nașterii</p>
            <p class="font-semibold">{{ child.birthDate }}</p>
          </div>
          <div>
            <p class="text-sm text-muted">Total Sesiuni</p>
            <p class="font-semibold text-lg">{{ attendances.length }}</p>
          </div>
          <div>
            <p class="text-sm text-muted">Procent Prezență</p>
            <p
              class="font-semibold text-lg"
              :class="attendancePercentage >= 80 ? 'text-success' : 'text-warning'"
            >
              {{ attendancePercentage }}%
            </p>
          </div>
        </div>
      </UCard>

      <UTable v-if="attendances.length > 0" :data="attendancesByDate" :columns="columns" />

      <AdminEmpty v-else title="Nicio înregistrare de prezență" />
    </template>
  </AdminPage>
</template>

<script setup lang="ts">
import { useChildrenApi } from "~/composables/api/useChildrenApi";
import { apiErrorMessage } from "~/composables/useApiError";
import { useAttendanceApi } from "~/composables/api/useAttendanceApi";
import type { Child } from "~/types/child.types";
import type { Attendance } from "~/types/attendance.types";
import { AttendanceType, ATTENDANCE_TYPE_LABELS } from "~/types/attendance.types";
import type { TableColumn } from "@nuxt/ui";
import { formatTime } from "~/composables/useUtils";

definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Prezenței unui Copil",
});

const childrenApi = useChildrenApi();
const attendanceApi = useAttendanceApi();
const route = useRoute();
const UBadge = resolveComponent("UBadge");

const child: Ref<Child | null> = ref(null);
const attendances: Ref<Attendance[]> = ref([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

const columns: TableColumn<Attendance>[] = [
  {
    // `accessorFn`, not `accessorKey`: the date lives on the class the mark belongs to now, and a
    // function is the half of this API that TypeScript actually checks — a stale `accessorKey`
    // string would have compiled and rendered an empty column.
    id: "date",
    accessorFn: (row) => row.classSession.date,
    header: "Data",
    cell: ({ row }) => {
      const date = row.getValue("date") as string;
      const formatted = new Date(date).toLocaleDateString("ro-RO", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      return formatted;
    },
  },
  {
    id: "startTime",
    accessorFn: (row) => row.classSession.startTime,
    header: "Ora Începerii",
    cell: ({ row }) => {
      const time = row.getValue("startTime") as string;
      return formatTime(time);
    },
  },
  {
    accessorKey: "type",
    header: "Tip Sesiune",
    cell: ({ row }) => {
      const type = row.getValue("type") as AttendanceType;

      // Keyed off the enum rather than off string literals, so a renamed value is a compile error
      // here instead of a silently blank column. The labels come from the shared contract, which is
      // where the Romanian wording for them belongs.
      const color: Record<AttendanceType, "neutral" | "warning"> = {
        [AttendanceType.REGULAR]: "neutral",
        [AttendanceType.MAKE_UP]: "warning",
      };

      return h(
        UBadge,
        { class: "capitalize", variant: "subtle", color: color[type] ?? "neutral" },
        () => ATTENDANCE_TYPE_LABELS[type] ?? type
      );
    },
  },
  {
    accessorKey: "present",
    header: "Prezent",
    cell: ({ row }) => {
      const color = {
        true: "success" as const,
        false: "error" as const,
      }[row.getValue("present") as string];

      return h(UBadge, { class: "capitalize", variant: "subtle", color }, () =>
        row.getValue("present") ? "Da" : "Nu"
      );
    },
  },
];

// A copy, not `attendances.sort(...)` in the template: that sorted the ref's own array in place on
// every render. The API already returns these chronologically; the sort stays as the guarantee the
// table depends on, rather than a detail it trusts the server to keep.
const attendancesByDate = computed(() =>
  [...attendances.value].sort(
    (a, b) =>
      a.classSession.date.localeCompare(b.classSession.date) ||
      a.classSession.startTime.localeCompare(b.classSession.startTime)
  )
);

const attendancePercentage = computed(() => {
  if (attendances.value.length === 0) return 0;
  const presentCount = attendances.value.filter((a) => a.present).length;
  return Math.round((presentCount / attendances.value.length) * 100);
});

/**
 * The register, and why a failure here cannot stay quiet.
 *
 * This used to catch into `console.error` and stop. The screen then rendered its empty state —
 * "Nicio înregistrare de prezență" — over a list that had never arrived, so a network fault read
 * as *this child has never once been to a class*. That is the same misreading the parent's
 * calendar was fixed for, and it is worse here, because the person looking is about to say it out
 * loud to the family.
 */
const load = async () => {
  loading.value = true;
  loadError.value = null;
  try {
    const childId = route.params.childId as string;
    const allChildren = await childrenApi.fetchChildren();
    child.value = allChildren.find((c) => String(c.id) === childId) || null;

    attendances.value = await attendanceApi.getAttendanceByChild(parseInt(childId));
  } catch (err: unknown) {
    loadError.value = apiErrorMessage(err, "Nu am putut încărca prezența copilului.");
  } finally {
    loading.value = false;
  }
};

onMounted(load);
</script>
