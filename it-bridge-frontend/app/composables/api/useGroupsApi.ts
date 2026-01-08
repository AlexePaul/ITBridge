import { useTokenStore } from "~/stores/tokenStore";
import { useApi } from "./useApi";
import type { Group } from "~/types/group.types";
import { useGroupsStore } from "~/stores/groupsStore";

export const useGroupsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const groupsStore = useGroupsStore();

  const fetchGroups = async () => {
    try {
      const data = await api<Group[]>("/groups", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });
      groupsStore.setGroups(data);
      return data;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to fetch groups";
      console.error(errorMessage);
      throw err;
    }
  };

  const createGroup = async (groupData: Partial<Group>) => {
    try {
      const createdGroup = await api<Group>("/groups", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
        body: groupData,
      });
      groupsStore.setGroups([...groupsStore.groups, createdGroup]);
      return createdGroup;
    } catch (err: any) {
      return err.data?.statusCode || 500;
    }
  };

  const updateGroup = async (groupId: string, groupData: Partial<Group>) => {
    try {
      const updatedGroup = await api<Group>(`/groups/${groupId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
        body: groupData,
      });
      const updatedGroups = groupsStore.groups.map((group) =>
        group.id === updatedGroup.id ? updatedGroup : group
      );
      groupsStore.setGroups(updatedGroups);
      return updatedGroup;
    } catch (err: any) {
      return err.data?.statusCode || 500;
    }
  };

  return {
    fetchGroups,
    createGroup,
    updateGroup,
  };
};
