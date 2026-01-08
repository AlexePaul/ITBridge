<template>
  <h1>Tablou de bord admin</h1>
  <p>Nu am habar ce va fi pe pagina asta hehe</p>
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Tablou de Bord Administrator",
});

onMounted(() => {
  setPageLayout("dashboard" as any);
});
</script>
