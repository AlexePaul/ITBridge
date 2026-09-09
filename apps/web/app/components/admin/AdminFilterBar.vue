<template>
  <UCard class="border">
    <div
      :class="
        layout === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-3 gap-4'
          : 'flex flex-wrap items-center gap-3'
      "
    >
      <slot />
    </div>

    <div
      v-if="countLabel || onClear"
      class="flex flex-wrap justify-between items-center gap-3 mt-4 pt-4 border-t border-muted"
    >
      <p class="text-sm text-muted">{{ countLabel }}</p>
      <UButton
        v-if="onClear"
        color="neutral"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        class="min-h-11"
        :disabled="!active"
        @click="onClear()"
      >
        {{ clearLabel }}
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
/**
 * The filter bar — E18/S5b, the last of the shapes the S5a catalogue named.
 *
 * Three incompatible forms were in use, and the story deliberately waited for the migration to say
 * which survived: a bare wide input (`children`), a card holding a grid of inputs with a result
 * count and a clear-all (`profiles`), and a flat row of a select and two checkboxes with a count
 * (`leads`). The card is what generalises — it is the only one with somewhere to put the two things
 * every filtered screen wants, which is how many rows are left and how to stop filtering.
 *
 * `layout` is the one difference kept: `grid` for several text filters side by side, `row` for a
 * handful of mixed controls that should sit on one line.
 *
 * **`onClear` is a prop that happens to be spelled like a listener**, for the reason written up in
 * `AdminError`: a declared emit is removed from `$attrs`, so a component cannot ask whether anybody
 * is listening, and the button that depends on the answer silently never renders. `@clear="…"`
 * compiles to this prop, so call sites keep the syntax they would have written anyway.
 */
withDefaults(
  defineProps<{
    /** "Afișez 4 din 12 familii" — the sentence a filtered screen owes its reader. */
    countLabel?: string;
    /** Called when the reader presses the clear button. Without it, no button. */
    onClear?: () => void;
    /** Whether anything is filtered; the clear button is disabled when nothing is. */
    active?: boolean;
    layout?: "grid" | "row";
    clearLabel?: string;
  }>(),
  {
    countLabel: undefined,
    onClear: undefined,
    active: false,
    layout: "grid",
    clearLabel: "Șterge filtrele",
  }
);
</script>
