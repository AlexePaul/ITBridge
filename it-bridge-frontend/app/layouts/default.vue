<template>
  <div v-if="authInitialized" class="min-h-screen flex flex-col">
    <!-- Single Navbar (shows different buttons based on auth state) -->
    <Navbar />

    <!-- Main Content -->
    <main class="flex-1 mt-16">
      <slot />
    </main>

    <!-- Footer -->
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/userStore";
import { authInitialized } from "~/plugins/auth.client";

const userStore = useUserStore();
</script>
