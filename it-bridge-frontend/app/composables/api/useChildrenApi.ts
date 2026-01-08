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

  const createChild = async (childData: Partial<Child>) => {
    const newChild = await api<Child>("/children", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: JSON.stringify(childData),
    });
    console.log("New child created:", newChild);
    return newChild;
  };

  const updateChild = async (childId: string, childData: Partial<Child>) => {
    const updatedChild = await api<Child>(`/children/${childId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
      body: JSON.stringify(childData),
    });
    console.log("Child updated:", updatedChild);
    return updatedChild;
  };

  const addChildToGroup = async (childId: string, groupId: string) => {
    const updatedChild = await api<Child>(`/children/${childId}/groups/${groupId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
    console.log(`Child ${childId} added to group ${groupId}:`, updatedChild);
    return updatedChild;
  };

  const removeChildFromGroup = async (childId: string, groupId: string) => {
    const updatedChild = await api<Child>(`/children/${childId}/groups/${groupId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
    console.log(`Child ${childId} removed from group ${groupId}:`, updatedChild);
    return updatedChild;
  };

  const deleteChild = async (childId: string) => {
    await api<void>(`/children/${childId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
    console.log("Child deleted:", childId);
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
