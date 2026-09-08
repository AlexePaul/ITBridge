<template>
  <UCard variant="subtle" class="border border-error">
    <div class="space-y-2">
      <p class="font-medium">{{ message }}</p>
      <div v-if="onRetry" class="pt-1">
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-rotate-ccw"
          class="min-h-11"
          @click="onRetry()"
        >
          {{ retryLabel }}
        </UButton>
      </div>
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
 * cannot re-map codes — one translator, not two.
 *
 * **The retry is a prop that happens to be spelled like a listener** (E18/S5b), and the spelling
 * is the whole point. Two screens — `leads` and the funnel panel of `rapoarte` — already wrote
 * `@retry="load"` against a component that emitted nothing, so Vue passed `onRetry` through as an
 * ordinary attribute onto the card, no button appeared, and nothing anywhere said so: those two
 * screens showed an error whose only way out was a page reload. Seventeen more had no way out
 * either, never having been offered one.
 *
 * Declaring `onRetry` as a **prop** rather than `retry` as an emit is what makes that impossible
 * to repeat. `@retry="load"` compiles to an `onRetry` prop, so every call site keeps the listener
 * syntax it would have written anyway, while the component gets a value it can actually test —
 * and the button renders only when there is something for it to call. A declared emit would have
 * been the idiomatic choice and is exactly the one that failed: Vue removes declared emits from
 * `$attrs`, so a component cannot ask whether anybody is listening.
 *
 * `#action` stays for anything that is not a retry.
 */
withDefaults(
  defineProps<{
    message: string;
    /** Called when the reader presses the retry button. Without it, no button. */
    onRetry?: () => void;
    retryLabel?: string;
  }>(),
  { onRetry: undefined, retryLabel: "Încearcă din nou" }
);
</script>
