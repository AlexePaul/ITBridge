<template>
    <UDashboardGroup>
        <UDashboardSidebar collapsible class="border-r">
            <template #header>
                <NuxtLink to="/" class="font-bold text-lg text-highlighted">IT Bridge School</NuxtLink>
            </template>
            <UNavigationMenu :items="baseNavigationItems" orientation="vertical" class="mt-3" />
        </UDashboardSidebar>
        <UDashboardPanel>
            <template #header>
                <UDashboardNavbar title="Dashboard" class="">
                    <template #right>
                        <div class="flex items-center gap-3">
                            <span v-if="user">{{ user.username }}</span>
                            <UColorModeSwitch />
                            <UButton label="Logout" size="md" color="primary" variant="outline" @click="handleLogout"/>
                        </div>
                    </template>
                </UDashboardNavbar>
            </template>
            <template #body>
                <slot />
            </template>
        </UDashboardPanel>
    </UDashboardGroup>
</template>
<script setup lang="ts">
import { useLogout } from "~/composables/useLogout";                
import { useUserStore } from "~/stores/userStore";

const { user } = useUserStore();
const { handleLogout } = useLogout();

const baseNavigationItems = [
    { label: "Situatia Scolara", to: "/user/dashboard", icon: "i-lucide-chart-bar" },
    { label: "Istoric Plati", to: "/user/payments", icon: "i-lucide-credit-card" },
    { label: "Profil", to: "/user/profile", icon: "i-lucide-user" }
];
</script>