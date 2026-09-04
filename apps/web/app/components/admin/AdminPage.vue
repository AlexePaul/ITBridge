<template>
  <div class="w-full mx-auto px-4 py-6 space-y-6" :class="widthClass">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-3xl font-bold">{{ title }}</h1>
        <p v-if="subtitle" class="text-muted mt-1">{{ subtitle }}</p>
      </div>
      <div class="flex items-center gap-3">
        <slot name="actions" />
        <!-- 44px, because these screens are opened on a phone too (E18/S7). -->
        <UButton v-if="backTo" :to="backTo" variant="outline" class="min-h-11">Înapoi</UButton>
      </div>
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * The admin page shell — E18/S5a.
 *
 * Every admin screen opened with the same five lines of header markup, hand-copied with small
 * mutations: three different max-widths, an `h-11` hack to align the header button with a badge,
 * and one page with an unstyled `h1`. This is that header, once. The `#actions` slot is where the
 * count badge and the create button go; `backTo` is the outline "Înapoi" that five screens
 * hand-rolled.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    /** Renders the outline "Înapoi" button, linking here. */
    backTo?: string;
    /** `md` for a single centered form, `lg` for most lists, `xl` for wide tables. */
    width?: "md" | "lg" | "xl";
  }>(),
  { subtitle: undefined, backTo: undefined, width: "lg" }
);

const widthClass = computed(
  () => ({ md: "max-w-md", lg: "max-w-5xl", xl: "max-w-7xl" })[props.width]
);
</script>
