<template>
  <UDashboardGroup class="flex md:hidden">
    <UDashboardSidebar mode="slideover">
      <template #header="{ collapsed }">
        <p>Hello! TODO: change this here into logo+brand</p>
      </template>
      <UNavigationMenu :items="navigationItemsSmallScreen" orientation="vertical" />
    </UDashboardSidebar>
    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar
          title="Dashboard"
          class="border-b border-neutral px-4 sm:px-6 lg:px-16 w-full"
        >
          <template #left>
            <NuxtLink
              to="/"
              class="text-lg sm:text-xl font-bold text-neutral-950 dark:text-neutral-50 hover:opacity-80 transition"
            >
              IT Bridge School
            </NuxtLink>
          </template>
          <template #right>
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
                <UDropdownMenu arrow :items="navigationItemsAuth">
                  <UButton variant="link">
                    <p class="hidden sm:flex">{{ userStore.user.username }}</p>
                    <UIcon name="i-lucide-chevron-down" />
                  </UButton>
                </UDropdownMenu>
                <UButton label="Logout" color="primary" variant="outline" @click="handleLogout" />
              </template>
              <!-- Theme toggle (always visible) -->
              <UColorModeSwitch />
            </div>
          </template>
        </UDashboardNavbar>
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
  <UDashboardGroup class="hidden md:flex">
    <UDashboardNavbar class="border-b border-neutral px-4 sm:px-6 lg:px-16 w-full">
      <template #left>
        <NuxtLink
          to="/"
          class="text-lg sm:text-xl font-bold text-neutral hover:opacity-80 transition"
        >
          IT Bridge School
        </NuxtLink>
      </template>
      <template #right>
        <UNavigationMenu :items="navigationItems" orientation="horizontal" class="hidden lg:flex" />
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
            <UDropdownMenu arrow :items="navigationItemsAuth">
              <UButton variant="link">
                <p class="hidden sm:flex">
                  {{ userStore.user.username }}
                </p>
                <UIcon name="i-lucide-chevron-down" />
              </UButton>
            </UDropdownMenu>
            <UButton label="Logout" color="primary" variant="outline" @click="handleLogout" />
          </template>
          <!-- Theme toggle (always visible) -->
          <UColorModeSwitch />
        </div>
      </template>
    </UDashboardNavbar>
  </UDashboardGroup>
</template>
<script setup lang="ts">
import { useLogout } from "~/composables/useLogout";
import { useUserStore } from "~/stores/userStore";
const userStore = useUserStore();
const { handleLogout } = useLogout();

const baseNavigationItems = [
  { label: "Cursuri", to: "/courses", icon: "i-lucide-book-open" },
  { label: "Inscriere", to: "/idkyet", icon: "i-lucide-clipboard-list" },
  { label: "Contact", to: "/contact", icon: "i-lucide-mail" },
  { label: "Despre noi", to: "/about", icon: "i-lucide-badge-info" },
];

const navigationItems = computed(() => {
  const items = [...baseNavigationItems];
  if (userStore.user) {
    items.push({ label: "Situatia Scolara", to: "/dashboard", icon: "i-lucide-chart-bar" });
  }
  return items;
});

const navigationItemsSmallScreen = computed(() => [
  { label: "Acasa", to: "/", icon: "i-lucide-home" },
  ...navigationItems.value,
]);

const navigationItemsAuth = ref([{ label: "Profil", to: "/profile" }]);
</script>
