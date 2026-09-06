import { useEnrollmentsApi } from "~/composables/api/useEnrollmentsApi";
import type { GroupOccupancy } from "~/types/enrollment.types";

/**
 * Seat counts for a screen full of groups — E18/S5b, and D7.
 *
 * Every screen that shows "x din y locuri ocupate" has to ask the server, because the only correct
 * count is `EnrollmentService.occupancyOf`: active enrolments **plus booked trials**. The two card
 * grids used to count the children they had already loaded, which leaves trials out and so tells
 * the admin a full group has a free seat — on the screen where they are choosing a group to put a
 * child in.
 *
 * One request per group, in parallel, which is what `OccupancyReportService` does server-side for
 * the same question. Already-known groups are skipped, so calling it again after the list is
 * filtered costs nothing.
 */
export const useGroupOccupancy = () => {
  const enrollmentsApi = useEnrollmentsApi();

  const occupancyByGroup = ref<Record<number, GroupOccupancy>>({});

  /**
   * A group whose count did not come back keeps no entry, so its card shows the em dash rather
   * than a number. That is the intended outcome of a failure here: the reader is told nothing
   * instead of being told something wrong, and the rest of the grid still counts.
   */
  const loadFor = async (groupIds: number[]) => {
    const missing = groupIds.filter((id) => !(id in occupancyByGroup.value));
    if (missing.length === 0) return;

    const counted = await Promise.all(
      missing.map((id) => enrollmentsApi.fetchOccupancy(id).catch(() => null))
    );

    const next = { ...occupancyByGroup.value };
    counted.forEach((occupancy) => {
      if (occupancy) next[occupancy.groupId] = occupancy;
    });
    occupancyByGroup.value = next;
  };

  const occupancyOf = (groupId: number): GroupOccupancy | null =>
    occupancyByGroup.value[groupId] ?? null;

  return { occupancyByGroup, occupancyOf, loadFor };
};
