<template>
  <h1>User Profiles</h1>
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "User Profiles",
});
</script>
