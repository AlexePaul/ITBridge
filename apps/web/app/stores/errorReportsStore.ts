import { defineStore } from "pinia";

/**
 * How many errors nobody has marked fixed — E06 S1 — as a figure in the menu.
 *
 * The same argument as the projects and the absences: the record exists so the office learns of a
 * fault before a family rings about it, and a list nobody opens does not do that. Loaded from the
 * dashboard layout, refreshed by the screen after every change; in memory, never in a cookie.
 */
export const useErrorReportsStore = defineStore("errorReports", () => {
  const open = ref(0);

  const setOpen = (count: number) => {
    open.value = count;
  };

  return { open, setOpen };
});
