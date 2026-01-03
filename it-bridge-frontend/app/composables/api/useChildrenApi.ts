import { useTokenStore } from "~/stores/tokenStore";
import { useApi } from "./useApi";
import type { Child } from "~/types/child.types";
import type { Attendance } from "~/types/attendance.types";
import { useAttendanceStore } from "~/stores/attendanceStore";
import { useChildrenStore } from "~/stores/childrenStore";

export const useChildrenApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const attendanceStore = useAttendanceStore();
  const childrenStore = useChildrenStore();

  const fetchChildren = async () => {
    const fetchedChildren = await api<Child[]>("/children", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
    childrenStore.setChildren(fetchedChildren);
    return fetchedChildren;
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
    fetchChildren,
    fetchChildrenAttendance,
  };
};
