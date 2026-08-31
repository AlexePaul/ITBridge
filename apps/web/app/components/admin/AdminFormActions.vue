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
      v-else-if="hasCancelListener"
      color="neutral"
      variant="subtle"
      class="flex-1 justify-center"
      @click="emit('cancel')"
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
 * and an event when the form lives in a modal.
 */
import { useAttrs } from "vue";

withDefaults(
  defineProps<{
    submitLabel: string;
    cancelTo?: string;
    cancelLabel?: string;
    loading?: boolean;
    disabled?: boolean;
    /** A destructive form — the submit turns red. */
    danger?: boolean;
  }>(),
  { cancelTo: undefined, cancelLabel: "Anulează", loading: false, disabled: false, danger: false }
);

const emit = defineEmits<{ cancel: [] }>();

// Vue exposes listeners through attrs; the cancel button only renders when somebody listens.
const attrs = useAttrs();
const hasCancelListener = computed(() => typeof attrs.onCancel === "function");
</script>
