import { defineStore } from "pinia";
import type { Child } from "~/types/child.types";

export const useChildrenStore = defineStore("children", () => {
  const children = ref<Child[]>([]);

  const setChildren = (data: Child[]) => {
    children.value = data;
  };
  return {
    children: readonly(children),
    setChildren,
  };
});
