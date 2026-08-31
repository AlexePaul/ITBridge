import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { Attendance, SessionRegister } from "~/types/attendance.types";

export const useAttendanceApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  /**
   * Marks a whole class, named by its session id.
   *
   * It used to be `POST /attendance/:groupId` with the date and the hour in the body: the client
   * described the class and the server took its word for it. The path changed shape rather than
   * being renamed, so a client still sending a group id gets a 404 instead of quietly writing the
   * register against whichever session happens to carry that number.
   */
  const markSessionAttendance = async (
    classSessionId: number,
    submissionData: {
      childrenAttendance: { childId: number; present: boolean }[];
    }
  ) => {
    return api<Attendance[]>(`/attendance/session/${classSessionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: submissionData,
    });
  };

  const updateAttendanceStatus = async (attendanceId: number, present: boolean) => {
    return api<Attendance>(`/attendance/${attendanceId}?status=${present}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
  };

  const getAttendanceByChild = async (childId: number) => {
    return api<Attendance[]>(`/attendance/child/${childId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
  };

  /**
   * The whole register of one class in one payload — session, children, marks, parent phones.
   * One request because the caller is a phone in a classroom on whatever signal reaches it (E12/S6).
   */
  const fetchSessionRegister = async (classSessionId: number) => {
    return api<SessionRegister>(`/attendance/session/${classSessionId}/register`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
  };

  /**
   * One tap, one mark. Idempotent on the server, so the offline queue can retry it blindly:
   * a duplicate is a no-op and a changed mind is a second write, never a 409.
   */
  const upsertMark = async (classSessionId: number, childId: number, present: boolean) => {
    return api<Attendance>(`/attendance/session/${classSessionId}/child/${childId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: { present },
    });
  };

  return {
    markSessionAttendance,
    updateAttendanceStatus,
    getAttendanceByChild,
    fetchSessionRegister,
    upsertMark,
  };
};
