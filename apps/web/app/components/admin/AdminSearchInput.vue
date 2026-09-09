<template>
  <UInput
    :model-value="modelValue"
    :placeholder="placeholder"
    :icon="icon"
    :size="size"
    :aria-label="label"
    class="w-full"
    :ui="{ base: 'w-full' }"
    @update:model-value="(value: string | number) => emit('update:modelValue', String(value))"
  >
    <template #trailing>
      <UButton
        v-if="modelValue"
        color="neutral"
        variant="link"
        icon="i-lucide-x"
        :aria-label="clearLabel ?? `Șterge filtrul „${label}”`"
        @click="emit('update:modelValue', '')"
      />
    </template>
  </UInput>
</template>

<script setup lang="ts">
/**
 * One text filter, with a clear button that has a name — E18/S5b.
 *
 * Four screens wrote this same shape by hand: an input, and inside `#trailing` a `v-if`'d icon
 * button that empties it. Only one of the four gave that button an `aria-label`; the three on
 * `/admin/profiles` had none, so a screen reader announced them as "button" and nothing else.
 *
 * **The accessibility gate could not have found them**, which is the argument for a component
 * rather than three `aria-label`s. The button only exists while the field has text, and the gate
 * loads screens — it does not type. So a control that appears mid-interaction is invisible to it by
 * construction, and the only durable fix is that there is one of these, not four.
 *
 * `label` names both: it is the field's accessible name and the noun in the clear button's. One
 * prop, two names, no way to give the field one and forget the other.
 */
withDefaults(
  defineProps<{
    modelValue: string;
    /** What this filter is — "Email", "Nume". Names the field and its clear button. */
    label: string;
    placeholder?: string;
    icon?: string;
    size?: "sm" | "md" | "lg" | "xl";
    /** Overrides the derived "Șterge filtrul „…”" where a screen has a better sentence. */
    clearLabel?: string;
  }>(),
  { placeholder: undefined, icon: "i-lucide-search", size: "md", clearLabel: undefined }
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>
