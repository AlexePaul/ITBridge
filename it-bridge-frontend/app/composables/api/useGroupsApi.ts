import { useTokenStore } from "~/stores/tokenStore";
import { useApi } from "./useApi";
import type { Group } from "~/types/group.types";

export const useGroupsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const fetchGroups = async () => {
    try {
      const data = await api<Group[]>("/groups", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });
      return data;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to fetch groups";
      console.error(errorMessage);
      throw err;
    }
  };

  return {
    fetchGroups,
  };
};
