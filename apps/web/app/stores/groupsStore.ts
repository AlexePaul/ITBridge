import { defineStore } from "pinia";
import type { Group } from "~/types/group.types";

export const useGroupsStore = defineStore("groups", () => {
  const groups = ref<Group[]>([]);

  const setGroups = (data: Group[]) => {
    groups.value = data;
  };

  const clearGroups = () => {
    groups.value = [];
  };

  const getGroupById = (id: string | number): Group | undefined => {
    return groups.value.find((group) => group.id == id);
  };

  return {
    groups: readonly(groups),
    setGroups,
    clearGroups,
    getGroupById,
  };
});
