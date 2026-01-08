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

  return {
    children: readonly(children),
    setChildren,
    clearChildren,
    getChildById,
  };
});
