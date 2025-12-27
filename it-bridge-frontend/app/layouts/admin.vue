<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible class="border-r">
      <template #header> </template>
      <UNavigationMenu :items="items" orientation="vertical" class="mt-3" />
      <template #footer>
        <div class="flex gap-2">
          <UButton
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            color="secondary"
            variant="ghost"
            @click="toggleColorMode"
            :title="isDark ? 'Light mode' : 'Dark mode'"
          />
          <UButton label="Logout" class="flex-1" color="secondary" />
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar title="Dashboard" class="" />
      </template>
      <template #body>
        <slot />
        <!-- This will render the page content -->
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

const toggleColorMode = () => {
  colorMode.preference = isDark.value ? "light" : "dark";
};

const items = ref<NavigationMenuItem[][]>([
  [
    { label: "Dashboard", icon: "i-lucide-house", to: "/" },
    { label: "Users", icon: "i-lucide-users", to: "/users" },
    { label: "Settings", icon: "i-lucide-settings", to: "/settings" },
  ],
]);
</script>
