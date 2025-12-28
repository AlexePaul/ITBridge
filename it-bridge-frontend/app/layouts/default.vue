<template>
  <div v-if="authInitialized" class="min-h-screen flex flex-col">
    <!-- Dynamic Navbar based on auth state -->
    <NavbarGuest v-if="!userStore.user" />
    <NavbarAuthenticated v-else />

    <!-- Main Content -->
    <main class="flex-1">
      <NuxtPage />
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
