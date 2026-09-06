import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { ALL_CHILDREN, useChildSelection } from "~/composables/useChildSelection";
import type { Child } from "~/types/child.types";

/**
 * The child switcher's state — E18/S4.
 *
 * Worth its own suite because the story's acceptance sentence rests on it: "a parent with two
 * children switches between them without getting lost". Everything below is a way of getting lost.
 */

/** A route object shaped like the one Nuxt hands over, mutable so a test can navigate. */
const route = reactive<{ query: Record<string, string | string[] | undefined> }>({ query: {} });

const replace = vi.fn((to: { query: Record<string, string> }) => {
  route.query = { ...to.query };
});

const child = (id: number, firstName: string): Child =>
  ({ id, firstName, lastName: "Popescu" }) as Child;

beforeEach(() => {
  route.query = {};
  replace.mockClear();
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useRouter", () => ({ replace }));
});

describe("useChildSelection", () => {
  it("shows every child until one is chosen", () => {
    const { selected, isShowingAll, includes } = useChildSelection();

    expect(selected.value).toBe(ALL_CHILDREN);
    expect(isShowingAll.value).toBe(true);
    // "All" includes everybody, so a screen renders every child rather than none of them.
    expect(includes(1)).toBe(true);
    expect(includes(2)).toBe(true);
  });

  it("reads the choice out of the URL, so a reloaded or shared page is about the same child", () => {
    route.query = { copil: "7" };
    const { selected, includes } = useChildSelection();

    expect(selected.value).toBe(7);
    expect(includes(7)).toBe(true);
    expect(includes(8)).toBe(false);
  });

  it("writes the choice to the URL and to the cookie", () => {
    const { select } = useChildSelection();

    select(4);

    expect(replace).toHaveBeenCalledWith({ query: { copil: "4" } });
    // A second composable instance — as a different page would build — sees the same choice, which
    // is what makes it survive navigating from Absențe to Proiecte.
    expect(useChildSelection().selected.value).toBe(4);
  });

  it("replaces rather than pushes, so comparing two children does not fill the back button", () => {
    const { select } = useChildSelection();

    select(1);
    select(2);
    select(1);

    expect(replace).toHaveBeenCalledTimes(3);
  });

  it("lets the URL win over the cookie", () => {
    useChildSelection().select(3);

    // A link that names a child — the one the tab row hands round — must not be overruled by
    // whatever this browser last looked at.
    route.query = { copil: "9" };
    expect(useChildSelection().selected.value).toBe(9);
  });

  it("carries the choice onto links to the other portal screens", () => {
    const { select, linkQuery } = useChildSelection();

    select(5);

    expect(linkQuery.value).toEqual({ copil: "5" });
  });

  it("ignores a malformed id rather than filtering everything away", () => {
    route.query = { copil: "nu-e-un-numar" };
    const { selected, isShowingAll } = useChildSelection();

    expect(selected.value).toBe(ALL_CHILDREN);
    expect(isShowingAll.value).toBe(true);
  });

  it("drops a selection that no longer names one of this family's children", () => {
    const { select, reconcile, selected } = useChildSelection();
    select(42);

    // The child left the school, or the cookie outlived them. Without this, every screen with a
    // switcher renders empty and reads as data loss rather than as a stale filter.
    reconcile([child(1, "Matei"), child(2, "Sofia")]);

    expect(selected.value).toBe(ALL_CHILDREN);
  });

  it("leaves a selection that still names a child alone", () => {
    const { select, reconcile, selected } = useChildSelection();
    select(2);

    reconcile([child(1, "Matei"), child(2, "Sofia")]);

    expect(selected.value).toBe(2);
  });
});
