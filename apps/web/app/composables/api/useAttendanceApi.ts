import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  AbsenceNotice,
  AnnounceAbsenceDto,
  Attendance,
  MakeUpCredit,
  MakeUpOption,
  SessionRegister,
} from "~/types/attendance.types";

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

  /**
   * Announces that a child will miss a class — E12/S3. A second announcement for the same class
   * amends the first rather than adding one, so the caller need not check.
   */
  const announceAbsence = async (dto: AnnounceAbsenceDto) =>
    api<AbsenceNotice>("/attendance/absences", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      body: dto,
    });

  /** Announced absences for classes still to come. A parent gets their own; an admin the school. */
  const fetchUpcomingAbsences = async () =>
    api<AbsenceNotice[]>("/attendance/absences", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** The child is coming after all. */
  const withdrawAbsence = async (id: number) =>
    api<{ message: string }>(`/attendance/absences/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** A family's make-up credits, each with its state derived on the server — E12/S4. */
  const fetchMakeUpCredits = async () =>
    api<MakeUpCredit[]>("/attendance/make-ups", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** The classes a credit could be spent on: right age band, free seat, inside the window. */
  const fetchMakeUpOptions = async (creditId: number) =>
    api<MakeUpOption[]>(`/attendance/make-ups/${creditId}/options`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** Books it. The server re-checks everything the options list filtered on. */
  const bookMakeUp = async (creditId: number, classSessionId: number) =>
    api<MakeUpCredit>(`/attendance/make-ups/${creditId}/booking`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      body: { classSessionId },
    });

  const cancelMakeUpBooking = async (creditId: number) =>
    api<MakeUpCredit>(`/attendance/make-ups/${creditId}/booking`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return {
    fetchMakeUpCredits,
    fetchMakeUpOptions,
    bookMakeUp,
    cancelMakeUpBooking,
    markSessionAttendance,
    updateAttendanceStatus,
    getAttendanceByChild,
    fetchSessionRegister,
    upsertMark,
    announceAbsence,
    fetchUpcomingAbsences,
    withdrawAbsence,
  };
};
