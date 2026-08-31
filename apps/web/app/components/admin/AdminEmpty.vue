<template>
  <UCard v-if="!bare" variant="subtle" class="border">
    <div class="py-8 text-center space-y-2">
      <UIcon :name="icon" class="text-3xl text-muted" />
      <p class="font-medium">{{ title }}</p>
      <p v-if="description" class="text-sm text-muted">{{ description }}</p>
      <div v-if="$slots.action" class="pt-2">
        <slot name="action" />
      </div>
    </div>
  </UCard>
  <div v-else class="py-8 text-center space-y-2">
    <UIcon :name="icon" class="text-3xl text-muted" />
    <p class="font-medium">{{ title }}</p>
    <p v-if="description" class="text-sm text-muted">{{ description }}</p>
    <div v-if="$slots.action" class="pt-2">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The empty state — E18/S5a.
 *
 * An empty list is an answer, not an absence, so it gets a sentence and, when there is an obvious
 * next step, a button (`#action`). `title` says what there is none of; `description` says what
 * would make one exist. `bare` drops the card wrapper for use inside something that is already a
 * card — AdminTable's empty slot, mainly.
 */
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    icon?: string;
    /** No card wrapper — for rendering inside a container that already has one. */
    bare?: boolean;
  }>(),
  { description: undefined, icon: "i-lucide-inbox", bare: false }
);
</script>
