<template>
  <div class="flex items-center gap-3 pt-2">
    <UButton
      type="submit"
      :color="danger ? 'error' : 'primary'"
      :loading="loading"
      :disabled="disabled || loading"
      class="flex-1 justify-center"
    >
      {{ submitLabel }}
    </UButton>
    <UButton
      v-if="cancelTo"
      :to="cancelTo"
      color="neutral"
      variant="subtle"
      class="flex-1 justify-center"
    >
      {{ cancelLabel }}
    </UButton>
    <UButton
      v-else-if="onCancel"
      color="neutral"
      variant="subtle"
      class="flex-1 justify-center"
      @click="onCancel()"
    >
      {{ cancelLabel }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
/**
 * The submit row of a form — E18/S5a.
 *
 * `type="submit"` and nothing else: the button submits the `UForm` it sits in, never a paired
 * `@click` that fires the handler a second time. `loading` is part of the signature rather than an
 * option, because seven of the ten admin forms shipped without it and every one of them
 * double-submits under a slow network. Cancel is a link when there is somewhere to go (`cancelTo`)
 * and a handler when the form lives in a modal.
 *
 * **`onCancel` is a prop, not an emit**, and it had to become one (E18/S5b). It was
 * `defineEmits({ cancel })` plus a `useAttrs().onCancel` test, which cannot work: Vue removes a
 * declared emit's listener from `$attrs`, so the test was always false and the button never
 * rendered at all. The template editor in `/admin/emailuri` is the one screen that passes
 * `@cancel`, and it has been shipping without its cancel button. A prop spelled `onCancel`
 * receives exactly the same `@cancel="…"` the call site already writes, and is a value the
 * component can actually check. `AdminError` carries the same note about the same mistake.
 */
withDefaults(
  defineProps<{
    submitLabel: string;
    cancelTo?: string;
    cancelLabel?: string;
    loading?: boolean;
    disabled?: boolean;
    /** A destructive form — the submit turns red. */
    danger?: boolean;
    /** Called when the reader cancels a form that has nowhere to navigate back to. */
    onCancel?: () => void;
  }>(),
  {
    cancelTo: undefined,
    cancelLabel: "Anulează",
    loading: false,
    disabled: false,
    danger: false,
    onCancel: undefined,
  }
);
</script>
