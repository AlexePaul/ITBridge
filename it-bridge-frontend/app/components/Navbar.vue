<template>
  <UDashboardNavbar class="border-b border-neutral px-4 sm:px-6 lg:px-16">
    <template #left>
      <NuxtLink
        to="/"
        class="text-lg sm:text-xl font-bold text-neutral-950 dark:text-neutral-50 hover:opacity-80 transition"
      >
        IT Bridge School
      </NuxtLink>
    </template>
    <template #right>
      <UNavigationMenu :items="navigationItems" orientation="horizontal" class="hidden md:flex" />

      <div class="flex items-center gap-3">
        <!-- Guest buttons -->
        <template v-if="!userStore.user">
          <UButton
            label="Login"
            size="md"
            color="primary"
            variant="outline"
            @click="navigateTo('/auth/login')"
          />
          <UButton
            label="Register"
            size="md"
            color="primary"
            variant="subtle"
            @click="navigateTo('/auth/register')"
          />
        </template>

        <!-- Authenticated buttons -->
        <template v-else>
          <UButton label="Logout" color="primary" variant="outline" @click="handleLogout" />
        </template>

        <!-- Theme toggle (always visible) -->
        <UColorModeSwitch />
      </div>
    </template>
  </UDashboardNavbar>
</template>

<script setup lang="ts">
import { useLogout } from "~/composables/useLogout";
import { useUserStore } from "~/stores/userStore";

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");
const userStore = useUserStore();
const { handleLogout } = useLogout();

const toggleColorMode = () => {
  colorMode.preference = isDark.value ? "light" : "dark";
};

const navigationItems = ref([
  [
    { label: "Cursuri", to: "/courses", icon: "i-lucide-book-open" },
    { label: "Inscriere", to: "/idkyet", icon: "i-lucide-clipboard-list" },
    { label: "Contact", to: "/contact", icon: "i-lucide-mail" },
  ],
]);
</script>
