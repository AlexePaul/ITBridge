<template>
  <UHeader>
    <template #title>
      <NuxtLink to="/" class="font-bold text-lg text-highlighted">IT Bridge School</NuxtLink>
    </template>
    <UNavigationMenu :items="baseNavigationItems" orientation="horizontal" class="mt-3" />
    <template #right>
      <div class="hidden items-center gap-3 md:flex">
        <template v-if="!userStore.user">
          <UButton
            label="Autentificare"
            size="md"
            color="primary"
            variant="outline"
            @click="navigateTo('/auth/login')"
          />
          <UButton
            label="Înregistrare"
            size="md"
            color="primary"
            variant="subtle"
            @click="navigateTo('/auth/register')"
          />
        </template>
        <template v-else>
          <UButton
            label="Dashboard"
            size="md"
            color="primary"
            variant="outline"
            @click="handleDashboard"
          />
          <UButton
            label="Logout"
            size="md"
            color="primary"
            variant="outline"
            @click="handleLogout"
          />
        </template>
        <UColorModeSwitch />
      </div>
    </template>
    <template #body>
      <!-- mobile menu -->
      <UNavigationMenu orientation="vertical" :items="baseNavigationItems" />
      <div class="flex flex-col items-start gap-3 mt-1 px-3">
        <template v-if="!userStore.user">
          <UButton
            label="Autentificare"
            size="md"
            color="primary"
            variant="outline"
            @click="navigateTo('/auth/login')"
          />
          <UButton
            label="Înregistrare"
            size="md"
            color="primary"
            variant="subtle"
            @click="navigateTo('/auth/register')"
          />
        </template>
        <template v-else>
          <UButton
            label="Tablou de Bord"
            size="md"
            color="primary"
            variant="outline"
            @click="handleDashboard"
          />
          <UButton
            label="Logout"
            size="md"
            color="primary"
            variant="outline"
            @click="handleLogout"
          />
        </template>
        <UColorModeSwitch />
      </div>
    </template>
  </UHeader>
</template>
<script setup lang="ts">
import { useLogout } from "~/composables/useLogout";
import { useUserStore } from "~/stores/userStore";
const userStore = useUserStore();
const { handleLogout } = useLogout();

const baseNavigationItems = [
  { label: "Home", to: "/", icon: "i-lucide-home" },
  { label: "Cursuri", to: "/courses", icon: "i-lucide-book-open" },
  { label: "Contact", to: "/contact", icon: "i-lucide-mail" },
  { label: "Despre noi", to: "/about", icon: "i-lucide-badge-info" },
];

const handleDashboard = () => {
  if (userStore.user?.role === "ADMIN") {
    navigateTo("/admin/dashboard");
  } else {
    navigateTo("/user/profile");
  }
};
</script>
