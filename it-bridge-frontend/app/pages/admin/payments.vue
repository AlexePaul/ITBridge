<template>
  <h1>Gestionarea Plăților</h1>
  <h2>TODO:</h2>
  listare + filtrare + adaugare plati manuale pt cash.
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Plăților",
});
</script>
