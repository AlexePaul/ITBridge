<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <slot name="body" />
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" :disabled="loading" @click="open = false">
          {{ cancelLabel }}
        </UButton>
        <UButton :color="danger ? 'error' : 'primary'" :loading="loading" @click="emit('confirm')">
          {{ confirmLabel }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
/**
 * One confirmation idiom — E18/S5a.
 *
 * Replaces the browser `confirm()` (which cannot say why in anything but a system font), and the
 * three hand-built modal footers that each ordered their buttons differently. The body slot is for
 * the sentence that explains the consequence — a confirm dialog with no consequence in it is just
 * a second click. The caller closes the modal itself after `confirm` succeeds, so a failed request
 * leaves the dialog open with the loading state released.
 */
withDefaults(
  defineProps<{
    title: string;
    confirmLabel: string;
    cancelLabel?: string;
    /** A destructive confirmation — the confirm button turns red. */
    danger?: boolean;
    /** Held by the caller while the confirmed request runs. */
    loading?: boolean;
  }>(),
  { cancelLabel: "Renunță", danger: false, loading: false }
);

const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ confirm: [] }>();
</script>
