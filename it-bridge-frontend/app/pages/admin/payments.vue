<template>
  <h1>Payments Management</h1>
  <h2>TODO:</h2>
  listare + filtrare + adaugare plati manuale pt cash.
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Payments Management",
});
</script>
