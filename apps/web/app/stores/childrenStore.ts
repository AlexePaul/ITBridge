import { defineStore } from "pinia";
import type { Child } from "~/types/child.types";
import type { EntityId } from "~/types/entityId";

export const useChildrenStore = defineStore("children", () => {
  const children = ref<Child[]>([]);

  const setChildren = (data: Child[]) => {
    children.value = data;
  };

  const clearChildren = () => {
    children.value = [];
  };

  const getChildById = (id: EntityId): Child | undefined => {
    return children.value.find((child) => child.id == id);
  };

  const getChildrenNumberByGroupId = (groupId: EntityId): number => {
    return children.value.filter((child) => child.group?.id == groupId).length;
  };

  const getChildrenByGroupId = (groupId: EntityId): Child[] => {
    return children.value.filter((child) => child.group?.id == groupId);
  };

  const getChildrenNotInGroupId = (groupId: EntityId): Child[] => {
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
