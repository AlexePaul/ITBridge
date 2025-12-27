<template>
  <div class="min-h-screen flex flex-col">
    <!-- Header -->
    <header class="border-b shadow-sm">
      <div
        class="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between"
      >
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold">IT Bridge School</h1>
        </div>
        <div class="flex items-center gap-3">
          <UButton
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            color="primary"
            variant="ghost"
            @click="toggleColorMode"
            :title="isDark ? 'Light mode' : 'Dark mode'"
          />
          <UButton label="Login" color="primary" @click="gotoLogin" />
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1 max-w-7xl w-full mx-auto px-6 py-12">
      <slot />
    </main>

    <!-- Footer -->
    <footer class="border-t mt-auto">
      <div class="max-w-7xl mx-auto px-6 py-6 text-center text-sm">
        <p>&copy; 2025 IT Bridge. All rights reserved.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

const toggleColorMode = () => {
  colorMode.preference = isDark.value ? "light" : "dark";
};

const gotoLogin = () => {
  navigateTo("/login");
};
</script>
