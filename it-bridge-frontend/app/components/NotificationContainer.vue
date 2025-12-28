<template>
  <div class="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
    <TransitionGroup name="slide">
      <div
        v-for="notification in notifications"
        :key="notification.id"
        class="animate-in slide-in-from-right"
      >
        <UAlert
          :color="
            notification.type === 'success'
              ? 'success'
              : notification.type === 'error'
                ? 'error'
                : 'info'
          "
          :icon="`i-lucide-${notification.type === 'success' ? 'check-circle' : notification.type === 'error' ? 'alert-circle' : 'info'}`"
          :variant="'solid'"
          :title="notification.title"
          :description="notification.description"
          @close="removeNotification(notification.id)"
        />
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useNotifications } from "~/composables/useNotifications";

const { notifications, removeNotification } = useNotifications();
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  transform: translateX(400px);
  opacity: 0;
}

.slide-leave-to {
  transform: translateX(400px);
  opacity: 0;
}
</style>
