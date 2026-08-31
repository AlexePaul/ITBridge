<template>
  <div
    class="flex items-center justify-between gap-4 p-4 border border-muted rounded-lg"
    :class="[
      clickable && 'hover:bg-muted transition-colors cursor-pointer',
      dimmed && 'opacity-60',
    ]"
    v-bind="clickable ? { role: 'button', tabindex: 0 } : {}"
    @click="clickable && emit('click')"
    @keydown.enter="clickable && emit('click')"
  >
    <div class="min-w-0">
      <div class="flex items-center gap-2 flex-wrap">
        <UBadge v-if="id !== undefined" variant="subtle" color="primary">#{{ id }}</UBadge>
        <span class="font-medium">{{ title }}</span>
        <slot name="badges" />
      </div>
      <p v-if="subtitle" class="text-muted text-sm mt-0.5">{{ subtitle }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0" @click.stop>
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One record as a row — E18/S5a.
 *
 * Six screens drew this same shape by hand: identity on the left, actions on the right, a border
 * that was `border-gray-200` on some and `border-muted` on others. This is the shape, once, on
 * tokens. `#badges` sits inline after the title (states: Probă, Trecut, Inactivă); `#actions` is
 * the right-hand column and swallows its clicks so a delete button inside a clickable row does not
 * also navigate; the default slot is for extra body lines.
 */
withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    /** Renders the `#id` badge in front of the title. */
    id?: number | string;
    clickable?: boolean;
    /** The calendar's past rows, an inactive group: still there, visibly less alive. */
    dimmed?: boolean;
  }>(),
  { subtitle: undefined, id: undefined, clickable: false, dimmed: false }
);

const emit = defineEmits<{ click: [] }>();
</script>
