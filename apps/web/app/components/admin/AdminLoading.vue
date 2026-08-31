<template>
  <div class="py-12 text-center text-muted" role="status">{{ label }}</div>
</template>

<script setup lang="ts">
/**
 * The loading state — E18/S5a.
 *
 * Text, no spinner: that is what the majority of well-formed screens already did, and a line of
 * text never spins forever next to an error nobody rendered. The label is a prop for the rare
 * screen that loads something other than a list.
 */
withDefaults(defineProps<{ label?: string }>(), { label: "Se încarcă…" });
</script>
