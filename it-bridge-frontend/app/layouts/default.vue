<template>
  <div class="min-h-screen flex flex-col">
    <Navbar />
    <UMain>
      <slot />
    </UMain>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useHead } from "#imports";

const route = useRoute();

const pageTitle = computed(() => {
  const title = (route.meta as any)?.title;
  return title || "Acasă";
});

useHead(() => ({
  title: pageTitle.value,
  titleTemplate: "%s | IT Bridge School",
}));
</script>
