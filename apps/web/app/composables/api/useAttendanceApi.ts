import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";

export const useAttendanceApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const markGroupAttendance = async (
    groupId: number,
    submissionData: {
      childrenAttendance: { childId: string; present: boolean }[];
      date: string;
      startTime: string;
    }
  ) => {
    try {
      const response = await api<any>(`/attendance/${groupId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
        body: submissionData,
      });
      console.log("Attendance marked response:", response);
      return response;
    } catch (err: any) {
      console.error("Error marking attendance:", err);
      throw err;
    }
  };

  const updateAttendanceStatus = async (attendanceId: number, present: boolean) => {
    return api(`/attendance/${attendanceId}?status=${present}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
  };

  const getAttendanceByChild = async (childId: number) => {
    return api(`/attendance/child/${childId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
  };

  return {
    markGroupAttendance,
    updateAttendanceStatus,
    getAttendanceByChild,
  };
};
