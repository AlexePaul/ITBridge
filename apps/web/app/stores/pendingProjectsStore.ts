import { defineStore } from "pinia";
import type { PendingProjectsSummary } from "~/types/project.types";
import { isStale } from "~/types/project.types";

/**
 * How much is waiting for somebody to press send — E17/S8.
 *
 * A store rather than a page-local ref because the figure has to be visible **from the menu**, on
 * every admin screen, and not only to whoever thinks to open `/admin/proiecte`. That is the whole
 * mitigation the story asks for: the risk of a button is that nobody presses it, and the answer to
 * that is not discipline, it is a number that stays in view.
 *
 * In memory, deliberately — not in a cookie like the location selector. This is server state with a
 * short shelf life: a stale copy restored from a reload would show a backlog that has already gone
 * out, or hide one that has just arrived.
 */
export const usePendingProjectsStore = defineStore("pendingProjects", () => {
  const summary = ref<PendingProjectsSummary | null>(null);

  const total = computed(() => summary.value?.total ?? 0);

  /** Whole days the oldest waiting document has been waiting; null when none are. */
  const oldestDays = computed(() => summary.value?.oldestDays ?? null);

  /**
   * Whether the backlog has stopped being a queue.
   *
   * The threshold comes from the server rather than from a constant here, so the line the interface
   * draws is the line the API says it draws — one definition, and it can move without a deploy of
   * the frontend.
   */
  const stale = computed(() => isStale(summary.value));

  const set = (data: PendingProjectsSummary) => {
    summary.value = data;
  };

  /** How many are waiting in one group, for the card on the projects screen. */
  const forGroup = (groupId: number) =>
    summary.value?.byGroup.find((entry) => entry.groupId === groupId) ?? null;

  return { summary, total, oldestDays, stale, set, forGroup };
});
