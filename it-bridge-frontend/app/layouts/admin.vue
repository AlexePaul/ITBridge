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
          <UButton label="Logout" class="flex-1" color="secondary" @click="handleLogout" />
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar title="Dashboard" class="" />
      </template>
      <template #body>
        <NuxtPage />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
<script setup lang="ts">
import type { NavigationMenuItem } from "@nuxt/ui";
import { useLogout } from "~/composables/useLogout";

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

const toggleColorMode = () => {
  colorMode.preference = isDark.value ? "light" : "dark";
};

const { handleLogout } = useLogout();

const items = ref<NavigationMenuItem[][]>([
  [
    { label: "Dashboard", icon: "i-lucide-house", to: "/dashboard/admin" },
    { label: "Users", icon: "i-lucide-users", to: "/dashboard/admin/users" },
    { label: "Settings", icon: "i-lucide-settings", to: "/dashboard/admin/settings" },
  ],
]);
</script>
