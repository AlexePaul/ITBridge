import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type {
  Enrollment,
  EnrollmentStatus,
  GroupOccupancy,
  WaitlistEntry,
  WaitlistStatus,
  DemandBucket,
} from "~/types/enrollment.types";

/**
 * Enrolments and the waiting list — E11/S1 and S3.
 *
 * Every call here is admin-only on the server (D2), so nothing in the parent portal uses this
 * composable; a parent sees their children through `/children`, scoped to their own family.
 */
export const useEnrollmentsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const authHeader = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  /** The whole history of one child, newest first. */
  const fetchHistory = async (childId: number) =>
    api<Enrollment[]>(`/enrollments/child/${childId}`, { headers: authHeader() });

  /**
   * Seats taken and free. `taken` includes booked trials — a trial child sits on a chair, at a
   * computer, in the same room (D7) — so never derive a second number from the enrolled count.
   */
  const fetchOccupancy = async (groupId: number) =>
    api<GroupOccupancy>(`/enrollments/group/${groupId}/occupancy`, { headers: authHeader() });

  /** Who was in the group on a given day, with the status of each enrolment. */
  const fetchMembers = async (groupId: number, date?: string) =>
    api<Enrollment[]>(`/enrollments/group/${groupId}/members${date ? `?date=${date}` : ""}`, {
      headers: authHeader(),
    });

  /** Trials nobody has decided on. A trial left open holds a seat for ever. */
  const fetchUnresolvedTrials = async (olderThanDays = 0) =>
    api<Enrollment[]>(`/enrollments/trials/unresolved?olderThanDays=${olderThanDays}`, {
      headers: authHeader(),
    });

  /** Unplaced demand, bucketed by age and location — E11/S7. */
  const fetchDemand = async () =>
    api<DemandBucket[]>("/enrollments/demand", { headers: authHeader() });

  const transfer = async (payload: {
    childId: number;
    toGroupId: number;
    reason?: string;
    allowOverCapacity?: boolean;
    acknowledgeWarnings?: boolean;
  }) =>
    api<Enrollment>("/enrollments/transfer", {
      method: "POST",
      headers: authHeader(),
      body: payload,
    });

  const resolveTrial = async (
    id: number,
    payload: { accepted: boolean; reason?: string; contractSignedAt?: string }
  ) =>
    api<Enrollment>(`/enrollments/${id}/resolve-trial`, {
      method: "PUT",
      headers: authHeader(),
      body: payload,
    });

  const enrol = async (payload: {
    childId: number;
    groupId: number;
    status?: EnrollmentStatus;
    startDate?: string;
    contractSignedAt?: string;
    allowOverCapacity?: boolean;
    acknowledgeWarnings?: boolean;
  }) => api<Enrollment>("/enrollments", { method: "POST", headers: authHeader(), body: payload });

  const closeEnrollment = async (
    id: number,
    payload: { status: EnrollmentStatus; exitReason?: string; endDate?: string }
  ) =>
    api<Enrollment>(`/enrollments/${id}/close`, {
      method: "PUT",
      headers: authHeader(),
      body: payload,
    });

  const fetchWaitlist = async (groupId: number) =>
    api<WaitlistEntry[]>(`/enrollments/waitlist/group/${groupId}`, { headers: authHeader() });

  const addToWaitlist = async (payload: { childId: number; groupId: number; note?: string }) =>
    api<WaitlistEntry>("/enrollments/waitlist", {
      method: "POST",
      headers: authHeader(),
      body: payload,
    });

  const removeFromWaitlist = async (id: number, status: WaitlistStatus = "CANCELLED") =>
    api<{ message: string }>(`/enrollments/waitlist/${id}`, {
      method: "DELETE",
      headers: authHeader(),
      body: { status },
    });

  return {
    fetchHistory,
    fetchMembers,
    fetchOccupancy,
    fetchUnresolvedTrials,
    fetchDemand,
    transfer,
    resolveTrial,
    enrol,
    closeEnrollment,
    fetchWaitlist,
    addToWaitlist,
    removeFromWaitlist,
  };
};
