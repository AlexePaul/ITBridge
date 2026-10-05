import { computed, ref, type Ref } from "vue";

/** How many rows a long admin list draws before it asks for more. */
export const LIST_WINDOW = 100;

/**
 * The first rows of a long list, and the way to the rest.
 *
 * At the size of a three-year school (`pnpm seed:scale`), `/admin/restante` drew 690 cards and
 * `/admin/contracte` 300 cards with a date field each, all at once: the main thread froze for
 * 1.6 s and 2.3 s on every open, and again after every payment, because the whole list was drawn
 * a second time (QA of 27 September 2026). A hundred rows is more than a screen of work, and the
 * rest is one press away; the totals above a list are counted from all of it, not from what is
 * drawn.
 *
 * What was drawn stays drawn when the list is read again: `shown` does not reset on a refresh, so
 * the row the office was working on is still where it was.
 */
export function useListWindow<T>(rows: Ref<readonly T[]>, step = LIST_WINDOW) {
  const shown = ref(step);
  const visible = computed(() => rows.value.slice(0, shown.value));
  const hidden = computed(() => Math.max(0, rows.value.length - shown.value));
  const more = () => {
    shown.value += step;
  };
  return { visible, hidden, more, step };
}

/** Lower case, without diacritics: „Ștefan" is found by „stefan", as the office types it. */
export function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a name answers to what somebody typed; an empty box matches everything. */
export function nameMatches(name: string, typed: string): boolean {
  const query = folded(typed);
  return !query || folded(name).includes(query);
}
