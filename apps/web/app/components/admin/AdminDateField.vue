<template>
  <div ref="fieldEl" class="w-full">
    <UInputDate
      v-model="calendarValue"
      :min-value="minValue"
      :max-value="maxValue"
      :disabled="disabled"
      class="w-full"
    >
      <template #trailing>
        <UPopover
          v-model:open="open"
          :reference="fieldEl"
          :content="{ align: 'start', sideOffset: 8 }"
        >
          <UButton
            color="neutral"
            variant="link"
            size="sm"
            icon="i-lucide-calendar"
            aria-label="Alege data din calendar"
            :disabled="disabled"
            class="px-0"
          />
          <template #content>
            <UCalendar
              v-model="calendarValue"
              :min-value="minValue"
              :max-value="maxValue"
              prevent-deselect
              class="p-2"
              @update:model-value="open = false"
            />
          </template>
        </UPopover>
      </template>
    </UInputDate>
  </div>
</template>

<script setup lang="ts">
/**
 * One date field for the admin forms — E18/S5b.
 *
 * The two child forms had pasted the Nuxt UI documentation's example: a `UInputDate` with a
 * `UPopover` anchored to `inputsRef?.[3]?.$el`, the field's fourth internal segment. In `ro` that
 * segment is a separator; under any other segment order it is something else again, and the ref
 * is an internal the component happens to expose. The calendar here is anchored to the field's
 * own wrapper, so nothing reads inside `UInputDate`, and it pops under the whole field rather
 * than under one digit of it.
 *
 * The model is the `YYYY-MM-DD` string the wire carries, not a `CalendarDate`: the form state
 * holds what the API takes, and the crossing lives in `useDateField.ts`, once and without a
 * `Date` in it. The forms used to go through `toISOString()`, the UTC trap from CLAUDE.md.
 * `min` and `max` are day keys too. Picking a day closes the calendar; clicking the day already
 * picked keeps it, rather than clearing a birth date by accident.
 */
import type { DateValue } from "@internationalized/date";
import { calendarToDateKey, dateKeyToCalendar } from "~/composables/useDateField";

const props = withDefaults(
  defineProps<{
    /** The earliest day on offer, `YYYY-MM-DD`. A typed date before it is marked invalid. */
    min?: string;
    /** The latest day on offer, `YYYY-MM-DD`. A typed date after it is marked invalid. */
    max?: string;
    disabled?: boolean;
  }>(),
  { min: undefined, max: undefined, disabled: false }
);

const model = defineModel<string | undefined>();

const fieldEl = ref<HTMLElement>();
const open = ref(false);

/** What both the segments and the calendar edit; every write lands in the string model. */
const calendarValue = computed<DateValue | undefined, DateValue | null | undefined>({
  get: () => dateKeyToCalendar(model.value),
  set: (value) => {
    model.value = calendarToDateKey(value);
  },
});

const minValue = computed(() => dateKeyToCalendar(props.min));
const maxValue = computed(() => dateKeyToCalendar(props.max));
</script>
