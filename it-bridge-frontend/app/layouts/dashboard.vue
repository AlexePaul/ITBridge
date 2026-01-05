<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible class="border-r">
      <template #header>
        <NuxtLink to="/" class="font-bold text-lg text-highlighted">IT Bridge School</NuxtLink>
      </template>
      <UNavigationMenu :items="navigationItems" orientation="vertical" class="mt-3" />
    </UDashboardSidebar>
    <UDashboardPanel>
      <template #header>
        <UDashboardNavbar :title="pageTitle" class="border-b">
          <template #right>
            <div class="flex items-center gap-3">
              <span v-if="user">{{ user.username }}</span>
              <UColorModeSwitch />
              <UButton
                label="Logout"
                size="md"
                color="primary"
                variant="outline"
                @click="handleLogout"
              />
            </div>
          </template>
        </UDashboardNavbar>
      </template>
      <template #body>
        <!-- Overdue Invoice Alert -->
        <UCard
          v-if="overdueInvoices && !isAdmin"
          class="w-9/12 mx-auto border border-error rounded-none mt-12 z-15 min-h-24"
          variant="subtle"
        >
          <div
            class="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 py-2"
          >
            <div class="flex items-center gap-2 sm:flex-1">
              <UIcon
                name="i-lucide-alert-circle"
                class="text-error shrink-0 text-xl md:text-2xl lg:text-3xl self-center"
              />
              <p class="font-bold text-lg">
                Au fost detectate facturi restante, daca aceasta este o greseala, nu ezitati sa ne
                contactati.
              </p>
            </div>
            <NuxtLink
              to="/user/payments"
              class="underline text-sm text-error font-semibold whitespace-nowrap self-start sm:self-center sm:ml-4"
            >
              Acceseaza istoricul plăților
            </NuxtLink>
          </div>
        </UCard>

        <!-- Pending Invoice Alert -->
        <UCard
          v-else-if="pendingInvoices && !isAdmin"
          class="w-9/12 md:1/3 mx-auto border border-warning rounded-none mt-12 z-15 min-h-24"
          variant="subtle"
        >
          <div
            class="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-4 py-2"
          >
            <div class="flex items-center gap-2 sm:flex-1">
              <UIcon
                name="i-lucide-alert-circle"
                class="text-warning shrink-0 text-xl md:text-2xl lg:text-3xl self-center"
              />
              <p class="font-bold text-lg">
                Aveti facturi care necesita plata. Va rugam sa accesati istoricul plăților pentru
                detalii.
                <br />Daca aceasta este o greseala, nu ezitati sa ne contactati.
              </p>
            </div>
            <NuxtLink
              to="/user/payments"
              class="underline text-sm text-warning font-semibold whitespace-nowrap self-start sm:self-center sm:ml-4"
            >
              Acceseaza istoricul plăților
            </NuxtLink>
          </div>
        </UCard>

        <slot />
      </template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
<script setup lang="ts">
import { useLogout } from "~/composables/useLogout";
import { useUserStore } from "~/stores/userStore";
import { overdueInvoices, pendingInvoices } from "~/composables/api/useInvoiceApi";
import { computed } from "vue";
import { useRoute } from "#imports";

const { user } = useUserStore();
const { handleLogout } = useLogout();

const userStore = useUserStore();
const isAdmin = userStore.user?.role === "ADMIN";
const route = useRoute();

const pageTitle = computed(() => {
  const title = (route.meta as any)?.title;
  return title || "Acasă";
});

useHead(() => ({
  title: pageTitle.value,
  titleTemplate: "%s | IT Bridge School",
}));

const navigationItems = computed(() => {
  const baseItems = [
    { label: "Home", to: "/", icon: "i-lucide-home" },
    { label: "Contact", to: "/contact", icon: "i-lucide-mail" },
  ];

  const userPages = [
    { label: "Profil", to: "/user/profile", icon: "i-lucide-user" },
    { label: "Situatia Scolara", to: "/user/dashboard", icon: "i-lucide-chart-bar" },
    { label: "Istoric Plati", to: "/user/payments", icon: "i-lucide-credit-card" },
  ];

  const adminPages = [
    { label: "Admin Dashboard", to: "/admin/dashboard", icon: "i-lucide-layout-dashboard" },
    { label: "User Profiles", to: "/admin/profiles", icon: "i-lucide-users" },
    { label: "Children", to: "/admin/children", icon: "i-lucide-baby" },
    { label: "Groups", to: "/admin/groups", icon: "i-lucide-users-round" },
    { label: "Attendance", to: "/admin/attendance", icon: "i-lucide-check-square" },
    { label: "Invoices", to: "/admin/invoices", icon: "i-lucide-notebook-pen" },
    { label: "Payments", to: "/admin/payments", icon: "i-lucide-wallet" },
  ];

  if (isAdmin) {
    return [...baseItems, ...adminPages];
  }

  return [...baseItems, ...userPages];
});
</script>
