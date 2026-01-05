<template>
  <h1>Groups Management</h1>
  <h2>TODO:</h2>
  <ul class="list-disc ml-6 space-y-2">
    <li>Selectezi o grupa</li>
    <li>Adaugi/sterge copii din grupa (poti adauga doar copii care nu au grup asignata)</li>
    <li>Salvezi modificarile</li>
  </ul>
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Groups Management",
});
</script>
