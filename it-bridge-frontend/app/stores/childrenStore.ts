import { defineStore } from "pinia";
import type { Child } from "~/types/child.types";

export const useChildrenStore = defineStore("children", () => {
  const children = ref<Child[]>([]);

  const setChildren = (data: Child[]) => {
    children.value = data;
  };

  const clearChildren = () => {
    children.value = [];
  };

  const getChildById = (id: string): Child | undefined => {
    return children.value.find((child) => child.id == id);
  };

  const getChildrenNumberByGroupId = (groupId: string): number => {
    return children.value.filter((child) => child.group?.id == groupId).length;
  };

  const getChildrenByGroupId = (groupId: string): Child[] => {
    return children.value.filter((child) => child.group?.id == groupId);
  };

  const getChildrenNotInGroupId = (groupId: string): Child[] => {
    return children.value.filter((child) => child.group?.id != groupId);
  };

  const getChildrenWithoutGroup = (): Child[] => {
    return children.value.filter((child) => !child.group || !child.group.id);
  };

  return {
    children: readonly(children),
    setChildren,
    clearChildren,
    getChildById,
    getChildrenNumberByGroupId,
    getChildrenByGroupId,
    getChildrenWithoutGroup,
    getChildrenNotInGroupId,
  };
});
