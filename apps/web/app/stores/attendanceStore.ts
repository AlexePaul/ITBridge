import { defineStore } from "pinia";
import { readonly } from "vue";
import type { Attendance } from "~/types/attendance.types";

type AttendanceState = Record<string, Attendance[]>;

export const useAttendanceStore = defineStore("attendance", () => {
  const attendance = useCookie<AttendanceState>("attendance", {
    default: () => ({}),
  });

  const setAttendance = (childId: string, attendanceData: Attendance[]) => {
    attendance.value = {
      ...attendance.value,
      [childId]: attendanceData,
    };
  };

  const attendancesByChildId = (childId: string): Attendance[] => {
    return attendance.value[childId] || [];
  };

  const attendancesByChildIdAndDate = (childId: string, date: Date): Attendance | undefined => {
    const attendances = attendance.value[childId] || [];
    return attendances.find((att) => {
      const recordDate = new Date(att.date);
      return (
        recordDate.getUTCFullYear() === date.getUTCFullYear() &&
        recordDate.getUTCMonth() === date.getUTCMonth() &&
        recordDate.getUTCDate() === date.getUTCDate()
      );
    });
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
    attendancesByChildIdAndDate,
  };
});
