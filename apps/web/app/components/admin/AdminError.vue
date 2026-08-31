<template>
  <UCard variant="subtle" class="border border-error">
    <div class="space-y-2">
      <p class="font-medium">{{ message }}</p>
      <slot name="action" />
    </div>
  </UCard>
</template>

<script setup lang="ts">
/**
 * The error state — E18/S5a.
 *
 * Takes a sentence, not an error object: the caller runs `apiErrorMessage` first, because that is
 * where the Romanian lives and where server codes become sentences. This component deliberately
 * cannot re-map codes — one translator, not two. A retry button goes in `#action`.
 */
defineProps<{ message: string }>();
</script>
