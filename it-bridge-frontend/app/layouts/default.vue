<template>
    <UDashboardGroup>
        <UDashboardSidebar collapsible class="border-r border-bg-light">
            <template #header>
            </template>
            <UNavigationMenu :items="items" orientation="vertical" class="mt-3 "/>
            <template #footer>
                <UButton label="Logout" class="" />
            </template>
        </UDashboardSidebar>

        <UDashboardPanel >
            <template #header>
                <UDashboardNavbar title="Dashboard" class="border-r border-bg-light" />
            </template>
            <template #body>
                <slot/> <!-- This will render the page content -->
            </template>
        </UDashboardPanel>
    </UDashboardGroup>
</template>
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const items = ref<NavigationMenuItem[][]>([
    [
        { label: 'Dashboard', icon: 'i-lucide-house', to: '/' },
        { label: 'Users', icon: 'i-lucide-users', to: '/users' },
        { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
    ]
])
</script>