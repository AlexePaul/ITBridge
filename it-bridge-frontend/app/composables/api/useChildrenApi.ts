import { useTokenStore } from "~/stores/tokenStore";
import { useApi } from "./useApi";
import type { Child } from "~/types/child.types";
import type { Attendance } from "~/types/attendance.types";
import { useAttendanceStore } from "~/stores/attendanceStore";

export const useChildrenApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const attendanceStore = useAttendanceStore();

  const children = ref<Child[]>([]);

  const fetchChildren = async () => {
    const fetchedChildren = await api<Child[]>("/children", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
    children.value = fetchedChildren;
    console.log("Fetched children:", children.value);
  };
  const fetchChildrenAttendance = async (childId: string) => {
    const attendance = await api<Attendance[]>(`/attendance/child/${childId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });

    attendanceStore.setAttendance(childId, attendance);
    return attendance;
  };
  return {
    children,
    fetchChildren,
    fetchChildrenAttendance,
  };
};
