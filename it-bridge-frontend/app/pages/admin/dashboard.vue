<template>
  <h1>Dashboard admin</h1>
  <p>i have 0 clue what will be on this page hehe</p>
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Dashboard Admin",
});
</script>
