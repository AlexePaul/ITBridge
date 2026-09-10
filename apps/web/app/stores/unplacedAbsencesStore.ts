import { defineStore } from "pinia";
import type { AbsenceNotice } from "~/types/attendance.types";
import { isSlipping } from "~/composables/useAbsenceOffice";
import { todayKey } from "~/composables/useAttendanceCalendar";

/**
 * This week's announced absences nobody has placed yet — E12/S4 — as a figure in the menu.
 *
 * The epic's open question was "cine îi spune biroului ce absențe din săptămâna asta n-au fost
 * încă plasate?": the endpoint answered it and nothing asked. A store rather than a page-local ref
 * for the same reason `pendingProjectsStore` is one — the risk the screen mitigates is that
 * somebody forgets to move a child, and a count you have to navigate to does not mitigate that.
 * Loaded from the dashboard layout, refreshed by the screen after every change.
 *
 * In memory, not in a cookie: server state with a short shelf life, and a stale copy would show
 * a child as waiting after the office moved them.
 */
export const useUnplacedAbsencesStore = defineStore("unplacedAbsences", () => {
  const notices = ref<AbsenceNotice[]>([]);

  const total = computed(() => notices.value.length);

  /**
   * How many are about to fall through — in time, not placed, and the missed class is today or
   * already gone. Turns the badge warning-coloured; the week may still have a class that fits.
   *
   * The day is read inside the computed rather than held beside the store, and that is deliberate
   * — the same rule the screen follows. `notices` is the only reactive thing this depends on and
   * every fetch replaces it, so the count is always judged against the day its rows were read on.
   * A `today` taken once at module or store level freezes on the tab the office leaves open
   * overnight, and then stops colouring exactly the notices that have just started to slip.
   */
  const slipping = computed(() => {
    const today = todayKey();
    return notices.value.filter((notice) => isSlipping(notice, today)).length;
  });

  const set = (list: AbsenceNotice[]) => {
    notices.value = list;
  };

  return { notices, total, slipping, set };
});
