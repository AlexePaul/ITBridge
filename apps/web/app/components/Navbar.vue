<template>
  <header class="nav">
    <div class="page nav-inner" :class="{ 'nav-open': isOpen }">
      <NuxtLink to="/" class="nav-brand" @click="isOpen = false">IT Bridge School</NuxtLink>

      <button
        type="button"
        class="btn btn-secondary btn-icon nav-toggle"
        :aria-expanded="isOpen"
        aria-controls="nav-menu"
        :aria-label="isOpen ? 'Închide meniul' : 'Deschide meniul'"
        @click="isOpen = !isOpen"
      >
        <UIcon :name="isOpen ? 'i-lucide-x' : 'i-lucide-menu'" class="size-4" />
      </button>

      <nav id="nav-menu" class="nav-links" aria-label="Navigare principală">
        <NuxtLink
          v-for="item in navigationItems"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          @click="isOpen = false"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <div class="nav-actions">
        <template v-if="!userStore.user">
          <NuxtLink to="/contact" class="btn btn-primary" @click="isOpen = false">
            Înscrie-ți copilul
          </NuxtLink>
          <NuxtLink to="/auth/login" class="btn btn-ghost" @click="isOpen = false">Cont</NuxtLink>
        </template>
        <template v-else>
          <NuxtLink :to="dashboardRoute" class="btn btn-primary" @click="isOpen = false">
            Contul meu
          </NuxtLink>
          <button type="button" class="btn btn-ghost" @click="handleLogout">Ieși din cont</button>
        </template>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useLogout } from "~/composables/useLogout";
import { useUserStore } from "~/stores/userStore";

const userStore = useUserStore();
const { handleLogout } = useLogout();

const isOpen = ref(false);

const navigationItems = [
  { label: "Acasă", to: "/" },
  { label: "Cursuri", to: "/courses" },
  { label: "Despre noi", to: "/about" },
  { label: "Contact", to: "/contact" },
];

const dashboardRoute = computed(() =>
  userStore.user?.role === "ADMIN" ? "/admin/dashboard" : "/user/profile"
);
</script>
