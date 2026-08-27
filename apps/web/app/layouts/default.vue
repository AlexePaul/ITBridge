<template>
  <div class="min-h-screen flex flex-col">
    <!-- Eight header tab stops sit before the content on every navigation. -->
    <a href="#continut" class="skip-link">Sari la conținut</a>
    <Navbar />
    <UMain id="continut" tabindex="-1">
      <slot />
    </UMain>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
// Every page under this layout declares its own head through useSeo — a title
// written here would fight with it.
</script>
