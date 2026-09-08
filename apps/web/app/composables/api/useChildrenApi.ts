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

  const fetchChildrenAttendance = async (childId: number) => {
    const attendance = await api<Attendance[]>(`/attendance/child/${childId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });

    attendanceStore.setAttendance(childId, attendance);
    return attendance;
  };

  const createChild = async (childData: Partial<Child>) => {
    const newChild = await api<Child>("/children", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: JSON.stringify(childData),
    });
    return newChild;
  };

  const updateChild = async (childId: number, childData: Partial<Child>) => {
    const updatedChild = await api<Child>(`/children/${childId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: JSON.stringify(childData),
    });
    return updatedChild;
  };

  /**
   * Puts a child in a group — which since E11/S1 opens an enrolment.
   *
   * `acknowledgeWarnings` answers the soft checks from S6: an age outside the group's band refuses
   * the first attempt and names the numbers, and this is how the screen says "yes, I know". It does
   * not get past a full group; capacity is checked first and is not a judgement call.
   */
  const addChildToGroup = async (childId: number, groupId: string, acknowledgeWarnings = false) => {
    const updatedChild = await api<Child>(`/children/${childId}/groups/${groupId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: { acknowledgeWarnings },
    });
    return updatedChild;
  };

  const removeChildFromGroup = async (childId: number, groupId: string) => {
    const updatedChild = await api<Child>(`/children/${childId}/groups/${groupId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
    return updatedChild;
  };

  const deleteChild = async (childId: number) => {
    await api<void>(`/children/${childId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
  };
  return {
    fetchChildren,
    fetchChildrenAttendance,
    createChild,
    updateChild,
    deleteChild,
    addChildToGroup,
    removeChildFromGroup,
  };
};
