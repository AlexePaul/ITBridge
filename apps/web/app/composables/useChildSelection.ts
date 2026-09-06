import { computed } from "vue";
import type { Child } from "~/types/child.types";

// `useRoute`, `useRouter` and `useCookie` are Nuxt auto-imports, left unimported like everywhere
// else in `composables/` — which is also what lets vitest run this file without booting Nuxt.

/** What the switcher holds when a screen is showing every child at once. */
export const ALL_CHILDREN = "all";

export type ChildSelection = typeof ALL_CHILDREN | number;

/** The query parameter the choice is written to. Romanian, because it is in a parent's URL. */
const QUERY_KEY = "copil";

/**
 * Which child the parent is looking at — E18/S4.
 *
 * The acceptance sentence of the story is "a parent with two children switches between them without
 * getting lost", and getting lost has two shapes. Reading one child's attendance believing it is the
 * other's is the dangerous one, and the answer to that is not here: it is that every block of data
 * repeats the child's name in its own label, so the name is never further from the figures than the
 * figures are from each other.
 *
 * This is the answer to the second shape — choosing a child, following a link, and arriving at the
 * other one. The choice is held in two places at once, and it needs both:
 *
 * - **the URL**, so a screen can be shared, reloaded or reached from the browser's own back button
 *   and still be about the child it was about. This is the authority whenever it says anything.
 * - **a cookie**, so the choice survives moving between Absențe and Proiecte, where the link is
 *   written without a query string. Same reason and same mechanism as the admin location filter in
 *   `locationStore`; a plain `ref` resets on a hard navigation and silently drops the parent back
 *   onto the first child.
 *
 * Nothing here validates the id against the family's own children, because nothing needs to: the API
 * scopes every list to the signed-in parent, so a foreign id filters to an empty screen rather than
 * showing somebody else's child. `reconcile` exists for the honest version of that — an id left over
 * from a child who has since left the school — which would otherwise leave a parent staring at an
 * empty page with no visible reason.
 */
export const useChildSelection = () => {
  const route = useRoute();
  const router = useRouter();

  const stored = useCookie<ChildSelection>("portalChild", {
    default: () => ALL_CHILDREN,
    sameSite: "lax",
  });

  const fromQuery = computed<ChildSelection | null>(() => {
    const raw = route.query[QUERY_KEY];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined || value === null || value === "") return null;
    if (value === ALL_CHILDREN) return ALL_CHILDREN;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  });

  const selected = computed<ChildSelection>(() => fromQuery.value ?? stored.value);

  const isShowingAll = computed(() => selected.value === ALL_CHILDREN);

  /**
   * Records the choice, in both places.
   *
   * `router.replace`, not `push`: switching between one's own children is changing what the screen
   * is about, not navigating. With `push`, a parent who compared two children four times would need
   * eight presses of the back button to leave the page.
   */
  const select = (selection: ChildSelection) => {
    stored.value = selection;
    void router.replace({
      query: { ...route.query, [QUERY_KEY]: String(selection) },
    });
  };

  /**
   * The query string to hang on a link to another portal screen, so the choice travels with it.
   *
   * The cookie would carry it anyway; this is what makes the URL of the page arrived at honest,
   * which matters the moment somebody copies it out of the address bar.
   */
  const linkQuery = computed(() => ({ [QUERY_KEY]: String(selected.value) }));

  /**
   * Drops a selection that no longer names one of this family's children.
   *
   * Called once the children have loaded. Without it, a family whose second child finished the
   * course keeps a stale id in a cookie, and every screen with a switcher renders empty — which
   * reads as data loss rather than as a stale filter.
   */
  const reconcile = (children: readonly Child[]) => {
    if (selected.value === ALL_CHILDREN) return;
    if (children.some((child) => child.id === selected.value)) return;
    select(ALL_CHILDREN);
  };

  /** True when `child` is the one being shown — including when every child is. */
  const includes = (childId: number) => isShowingAll.value || selected.value === childId;

  return { selected, isShowingAll, select, linkQuery, reconcile, includes };
};
