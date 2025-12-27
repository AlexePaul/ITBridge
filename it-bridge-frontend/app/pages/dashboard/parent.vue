<template>
  <div class="p-4">
    <h1 class="text-3xl font-bold">Welcome to Parent Dashboard</h1>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/composables/useUserStore";

definePageMeta({
  layout: "parent" as any,
  middleware: "auth" as any,
});

const { user } = useUserStore();
</script>
