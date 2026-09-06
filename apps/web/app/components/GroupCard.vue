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

    <!-- Seats taken, counted by the server (D7) -->
    <div class="flex items-center gap-3 mb-4 pt-3 border-t border-muted">
      <UIcon name="i-lucide-baby" class="text-warning" />
      <span class="text-sm text-muted">{{ seatsLine }}</span>
      <UBadge v-if="waiting > 0" color="warning" variant="soft" size="sm" class="ml-auto">
        {{ waiting }} pe listă
      </UBadge>
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
import { formatSeats } from "~/composables/useAdminFormat";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import type { GroupOccupancy } from "~/types/enrollment.types";
import type { Group } from "~/types/group.types";

const props = withDefaults(
  defineProps<{
    group: Group;
    /**
     * Seats, as the server counts them — `GET /enrollments/group/:id/occupancy`.
     *
     * Optional because the card renders before the count lands, and `null` while it is in flight.
     * The card never falls back to counting the enrolled children itself: that list has no trials
     * in it, so the number it produces says a full group has room (D7). Whoever renders the card
     * owns the fetch; see `/admin/groups`.
     */
    occupancy?: GroupOccupancy | null;
    showEdit?: boolean;
    showManageChildren?: boolean;
    showWeekday?: boolean;
    isSelected?: boolean;
  }>(),
  {
    occupancy: null,
    showEdit: true,
    showManageChildren: true,
    showWeekday: false,
    isSelected: false,
  }
);

/** The group's own capacity is the fallback: it is a column on the group, not a derived number. */
const seatsLine = computed(() =>
  formatSeats(props.occupancy?.taken, props.occupancy?.capacity ?? props.group.capacity)
);

const waiting = computed(() => props.occupancy?.waiting ?? 0);

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
