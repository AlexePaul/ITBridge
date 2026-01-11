<template>
  <div class="flex flex-row gap-4 mt-6 w-full justify-center">
    <UCard
      variant="subtle"
      class="w-1/3 h-72 text-center hover:border-primary cursor-pointer transition-all hover:shadow-lg border border-transparent"
      @click="navigateTo('/admin/attendance/group')"
    >
      <div class="flex flex-col h-full justify-between py-4">
        <div>
          <UIcon name="i-lucide-users" class="mx-auto text-4xl text-primary mb-3" />
          <h1 class="text-2xl font-bold">Prezenta unei Grupe</h1>
          <p class="text-muted text-sm mt-2">De aici poti face prezenta pentru o grupa anume</p>
        </div>
        <div class="text-xs text-gray-400">Selecteaza o grupa si marcheaza prezenta copiilor</div>
      </div>
    </UCard>
    <UCard
      variant="subtle"
      class="w-1/3 h-72 text-center hover:border-primary cursor-pointer transition-all hover:shadow-lg border border-transparent"
      @click="navigateTo('/admin/attendance/children')"
    >
      <div class="flex flex-col h-full justify-between py-4">
        <div>
          <UIcon name="i-lucide-user" class="mx-auto text-4xl text-secondary mb-3" />
          <h1 class="text-2xl font-bold">Prezenta unui Copil</h1>
          <p class="text-muted text-sm mt-2">
            De aici poti verifica istoricul de prezente ale unui copil
          </p>
        </div>
        <div class="text-xs text-gray-400">
          Consulta si corecteaza prezentele unei anumite persoane
        </div>
      </div>
    </UCard>
  </div>
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Gestionarea Prezenței",
});
</script>
