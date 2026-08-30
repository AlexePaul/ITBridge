import { defineStore } from "pinia";
import { readonly } from "vue";
import type { Attendance } from "~/types/attendance.types";
import type { EntityId } from "~/types/entityId";

type AttendanceState = Record<string, Attendance[]>;

/**
 * În memorie, nu într-un cookie.
 *
 * Prezența stătea într-un `useCookie("attendance")`, iar asta nu a mers niciodată la mai mult de
 * două-trei ședințe: o înregistrare cară acum ședința întreagă, cu grupa, sala și locația ei, deci
 * **7 ședințe înseamnă 11,7 KB, iar URI-encoded în cookie 18,6 KB** — față de limita de ~4 KB a
 * browserului. Măsurat pe baza reală, prin `GET /attendance/child/:id`.
 *
 * Eșecul e tăcut și de asta a supraviețuit atâta: browserul aruncă pur și simplu cookie-ul prea
 * mare, nimic nu aruncă o eroare, iar calendarul din `pages/user/dashboard.vue` se randează fără
 * culori — arată ca „copilul n-a fost la nicio oră", nu ca un bug.
 *
 * Nu e nimic de păstrat între reîncărcări: `useChildrenApi` reîncarcă prezența la fiecare montare
 * a paginii, deci cookie-ul nu economisea nici măcar o cerere.
 */
export const useAttendanceStore = defineStore("attendance", () => {
  const attendance = ref<AttendanceState>({});

  const setAttendance = (childId: EntityId, attendanceData: Attendance[]) => {
    attendance.value = {
      ...attendance.value,
      [childId]: attendanceData,
    };
  };

  /**
   * The whole list, and no per-day lookup.
   *
   * There used to be an `attendancesByChildIdAndDate` that matched a `Date` against
   * `classSession.date` through `getUTC*`. Nothing calls it any more: the calendar decides a day in
   * `useAttendanceCalendar`, comparing `YYYY-MM-DD` strings, because `classSession.date` is a bare
   * date and putting it through `new Date()` makes it the previous day everywhere west of
   * Greenwich. Do not bring the `Date` version back - it is the same trap in a different file.
   */
  const attendancesByChildId = (childId: EntityId): Attendance[] => {
    return attendance.value[childId] || [];
  };

  const clearAttendance = (childId?: string) => {
    if (!childId) {
      attendance.value = {};
      return;
    }

    const { [childId]: _, ...rest } = attendance.value;
    attendance.value = rest;
  };

  return {
    attendance: readonly(attendance),
    setAttendance,
    clearAttendance,
    attendancesByChildId,
  };
});
