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
// Every page under this layout declares its own head through useSeo — a title
// written here would fight with it.
</script>
