<template>
  <header class="border-b shadow-sm">
    <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <UButton class="text-2xl font-bold" variant="link" disabled @click="navigateTo('/')"
          ><span class="text-neutral-950 dark:text-neutral-50">IT Bridge School</span></UButton
        >
      </div>
      <div class="flex items-center gap-3">
        <UButton label="Logout" color="primary" variant="outline" @click="handleLogout" />
        <UButton
          :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
          color="primary"
          variant="ghost"
          @click="toggleColorMode"
          :title="isDark ? 'Light mode' : 'Dark mode'"
        />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useLogout } from "~/composables/useLogout";

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

const toggleColorMode = () => {
  colorMode.preference = isDark.value ? "light" : "dark";
};

const { handleLogout } = useLogout();
</script>
