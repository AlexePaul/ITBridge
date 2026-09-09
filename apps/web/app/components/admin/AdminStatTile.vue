<template>
  <component :is="element" v-bind="elementProps" :class="classes">
    <p class="text-2xl font-semibold tabular-nums">{{ value }}</p>
    <p class="text-sm text-muted mt-0.5">{{ label }}</p>
    <p v-if="note" class="text-xs text-muted mt-1 tabular-nums">{{ note }}</p>
  </component>
</template>

<script setup lang="ts">
/**
 * One number with its name under it — E18/S5b.
 *
 * Six grids drew this same tile: `/admin/dashboard`, `/admin/restante`, `/admin/invoices`, the
 * finance and occupancy rows of `/admin/rapoarte`, and `/admin/livrari`. The markup was identical
 * every time — `border rounded-lg p-4`, a `text-2xl tabular-nums` value, a `text-sm text-muted`
 * label, sometimes a smaller note — and the only thing that really differed was the **element**,
 * which is not decoration: it is what the tile does.
 *
 *   <div>       the number is a fact to read          (restante, invoices, rapoarte)
 *   <NuxtLink>  the number takes you where to act on it   (dashboard)
 *   <button>    the number filters the list below it      (livrari)
 *
 * So that is what the props choose. `to` makes it a link, `onSelect` makes it a button, neither
 * leaves it inert — and a tile can never end up as a `div` with a click handler, which is the
 * shape E18/S6 spent a story removing from four screens because it takes no focus and answers no
 * Enter.
 *
 * **`onSelect` is a prop spelled like a listener**, the same trick `AdminError` and
 * `AdminFormActions` use and for the same reason: Vue strips a declared emit's listener out of
 * `$attrs`, so a component that emits cannot ask whether anybody is listening — and this one has
 * to know, because the answer decides what element it renders. `@select="…"` at the call site
 * compiles to exactly this prop.
 *
 * `pressed` is for the filtering kind and does two things at once, deliberately: it draws the
 * accent border **and** sets `aria-pressed`. `/admin/livrari` marked the active filter with a
 * colour alone, so which of the four states was filtering the list was information only a sighted
 * reader had.
 */
import { computed } from "vue";
import { resolveComponent } from "vue";

const props = withDefaults(
  defineProps<{
    /** The number, already formatted — "12", "1.250 lei", "83%". The caller owns the wording. */
    value: string | number;
    label: string;
    /** A smaller line under the label, for the qualification a label has no room for. */
    note?: string;
    /** Where the tile leads. Given, it is a link. */
    to?: string;
    /** Called when the tile is pressed. Given, it is a button. Ignored alongside `to`. */
    onSelect?: () => void;
    /** `warning` marks a number that wants somebody; the border says so before the digit is read. */
    tone?: "muted" | "warning";
    /** For a button tile: this one is the filter currently in force. */
    pressed?: boolean;
  }>(),
  { note: undefined, to: undefined, onSelect: undefined, tone: "muted", pressed: false }
);

const NuxtLink = resolveComponent("NuxtLink");

const isLink = computed(() => Boolean(props.to));
const isButton = computed(() => !isLink.value && Boolean(props.onSelect));

const element = computed(() => (isLink.value ? NuxtLink : isButton.value ? "button" : "div"));

const elementProps = computed(() => {
  if (isLink.value) return { to: props.to };
  if (isButton.value) {
    // `type` matters: a tile inside a form would otherwise submit it.
    return { type: "button", "aria-pressed": props.pressed, onClick: () => props.onSelect?.() };
  }
  return {};
});

const classes = computed(() => [
  "border rounded-lg p-4",
  // Only what can be pressed reacts to the pointer. A hover on a tile that does nothing reads as
  // an invitation, and the reader who accepts it learns nothing happens.
  isLink.value || isButton.value ? "transition-colors hover:bg-muted text-left w-full block" : "",
  props.pressed ? "border-primary" : props.tone === "warning" ? "border-warning" : "border-muted",
]);
</script>
