<template>
  <UAlert
    icon="i-lucide-alert-circle"
    color="error"
    :title="title"
    :description="description"
    :closable="closable"
    @close="$emit('close')"
    class="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    closable?: boolean;
  }>(),
  {
    title: "Error",
    closable: true,
  }
);

defineEmits<{
  close: [];
}>();
</script>
