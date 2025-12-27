<template>
  <div class="min-h-screen flex flex-col">
    <!-- Header -->
    <header class="border-b shadow-sm">
      <div class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <UButton class="text-2xl font-bold" variant="link" disabled @click="navigateTo('/')"
            ><span class="text-neutral-950 dark:text-neutral-50">IT Bridge School - parent</span></UButton
          >
        </div>
        <div class="flex items-center gap-3">
          <UButton
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            color="primary"
            variant="ghost"
            @click="toggleColorMode"
            :title="isDark ? 'Light mode' : 'Dark mode'"
          />
          <UButton label="Logout" color="primary" variant="outline" @click="logOut" />
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-6 py-12">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t mt-auto">
      <div class="max-w-7xl mx-auto px-6 py-6 text-center text-sm">
        <p>&copy; 2025 IT Bridge. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useTokens } from "~/composables/useTokens";    
import { useUserStore } from "~/composables/useUserStore";

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

const toggleColorMode = () => {
  colorMode.preference = isDark.value ? "light" : "dark";
};

const logOut = () => {
  const tokenStore = useTokens();
  const { logout } = useUserStore();
  tokenStore.clearTokens();
  logout(); // Clear user store
  navigateTo("/");
};
</script>
