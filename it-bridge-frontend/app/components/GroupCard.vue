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
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <UBadge variant="subtle" color="secondary"> #{{ group.id }} </UBadge>
          <UBadge v-if="!group.isActive" color="warning" variant="soft" size="sm"> Inactiv </UBadge>
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

    <!-- Age Range -->
    <div class="flex items-center gap-3 mb-4">
      <UIcon name="i-lucide-users" class="text-secondary" />
      <span class="text-sm">Vârstă {{ group.minAge }} - {{ group.maxAge }}</span>
    </div>

    <!-- Children Count -->
    <div class="flex items-center gap-3 mb-4 pt-3 border-t border-muted">
      <UIcon name="i-lucide-baby" class="text-warning" />
      <span class="text-sm text-muted">
        {{ childrenStore.getChildrenNumberByGroupId(String(group.id)) }} copii inscrisi
      </span>
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
import { useChildrenStore } from "~/stores/childrenStore";
import { formatTime, getWeekdayName } from "~/composables/useUtils";
import type { Group } from "~/types/group.types";

const props = withDefaults(
  defineProps<{
    group: Group;
    showEdit?: boolean;
    showManageChildren?: boolean;
    showWeekday?: boolean;
    isSelected?: boolean;
  }>(),
  {
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

const childrenStore = useChildrenStore();

const onEdit = () => {
  emit("edit", props.group.id);
};

const onManageChildren = () => {
  emit("manageChildren", props.group.id);
};
</script>
