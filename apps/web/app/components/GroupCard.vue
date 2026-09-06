<template>
  <UCard
    :class="[
      'hover:shadow-lg transition-shadow border-2 border-transparent',
      isSelected && 'border-2 border-primary',
      !group.isActive &&
        'opacity-50 border border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30',
    ]"
  >
    <template #header>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="font-semibold truncate">{{ group.name }}</p>
          <div class="flex items-center gap-2 mt-1">
            <UBadge variant="subtle" color="secondary"> #{{ group.id }} </UBadge>
            <UBadge v-if="!group.isActive" color="warning" variant="soft" size="sm">
              Inactiv
            </UBadge>
          </div>
        </div>
        <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis-vertical" />
      </div>
    </template>

    <!-- Time -->
    <div class="flex items-center gap-3 mb-3">
      <UIcon name="i-lucide-clock" class="text-primary" />
      <template v-if="props.showWeekday"> {{ getWeekdayName(group.weekday) }},</template>
      <span class="font-semibold">
        {{ formatTime(group.startTime) }} - {{ formatTime(group.endTime) }}
      </span>
    </div>

    <!-- Where -->
    <div v-if="group.room" class="flex items-center gap-3 mb-3">
      <UIcon name="i-lucide-map-pin" class="text-primary" />
      <span class="text-sm">{{ group.room.location.name }} · {{ group.room.name }}</span>
    </div>

    <!-- Age Range -->
    <div class="flex items-center gap-3 mb-4">
      <UIcon name="i-lucide-users" class="text-secondary" />
      <span class="text-sm">Vârstă {{ group.minAge }} - {{ group.maxAge }}</span>
    </div>

    <!-- Seats. D7: a trial sits in the room, so the number has one owner and this is not it. -->
    <div class="flex items-center gap-3 mb-4 pt-3 border-t border-muted">
      <UIcon
        name="i-lucide-armchair"
        :class="occupancy && occupancy.free === 0 ? 'text-warning' : 'text-secondary'"
      />
      <span v-if="occupancy" class="text-sm text-muted">
        {{ occupancy.taken }} din {{ occupancy.capacity }} locuri ocupate<template
          v-if="occupancy.free === 0"
        >
          · plină</template
        ><template v-if="occupancy.waiting > 0"> · {{ occupancy.waiting }} pe listă</template>
      </span>
      <span v-else class="text-sm text-muted">{{ group.capacity }} locuri</span>
    </div>

    <!-- Actions -->
    <template #footer v-if="props.showEdit || props.showManageChildren">
      <div class="flex gap-2">
        <UButton
          v-if="props.showEdit"
          color="primary"
          variant="soft"
          size="sm"
          class="flex-1 justify-center"
          @click="onEdit"
        >
          Editare
        </UButton>
        <UButton
          v-if="props.showManageChildren"
          color="secondary"
          variant="soft"
          size="sm"
          class="flex-1 justify-center"
          @click="onManageChildren"
        >
          Gestionează
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import type { Group } from "~/types/group.types";

/**
 * One group, as a card — E18/S5.
 *
 * **The seat count is given to it, never computed here**, which is the move E18/S5b asks for by
 * name: "GroupCard trebuie mutat pe occupancyOf — D7". It used to filter `childrenStore` by group
 * id and count the result.
 *
 * That count was not wrong today, and the honest reason to remove it is not that it lied. It is
 * that it was **a second answer to a question one service owns**: `EnrollmentService.occupancyOf`
 * defines seats taken as enrolments in force, active plus trials (D7). The card's version agreed
 * only because `Child.group` happens to be written for trials too, in the same transaction as the
 * enrolment — a coupling that is real, invisible from here, and nobody's job to preserve.
 *
 * Two things were wrong regardless. The number was a filter over whatever the browser had loaded,
 * so a `fetchChildren()` that failed or came back partial rendered a smaller count with no error
 * anywhere. And it could not know about the waiting list at all, which is half of what "is this
 * group full" means to the person asking.
 *
 * With no `occupancy` prop the card names the capacity and says nothing about how full it is —
 * deliberately: a seat count nobody can source is worse than none, because it gets believed.
 */
const props = withDefaults(
  defineProps<{
    group: Group;
    /** Seats as the enrolment service counts them: `taken` is active plus trials, per D7. */
    occupancy?: { taken: number; free: number; capacity: number; waiting: number };
    showEdit?: boolean;
    showManageChildren?: boolean;
    showWeekday?: boolean;
    isSelected?: boolean;
  }>(),
  {
    occupancy: undefined,
    showEdit: true,
    showManageChildren: true,
    showWeekday: false,
    isSelected: false,
  }
);

const emit = defineEmits<{
  edit: [groupId: number];
  manageChildren: [groupId: number];
}>();

const onEdit = () => {
  emit("edit", props.group.id);
};

const onManageChildren = () => {
  emit("manageChildren", props.group.id);
};
</script>
