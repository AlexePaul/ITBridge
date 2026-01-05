<template>
  <h1>Attendance Management</h1>
  <h2>TODO:</h2>
  <ul class="list-disc ml-6 space-y-2">
    <li>selectezi grupa</li>
    <li>
      Ti se deschide un meniu cu toti copii din grupa aceea + la final daca vrei tu s adaugi si
      cauti dupa nume
    </li>
    <li>
      Bifezi prezenta/absenta pentru fiecare copil (evident, pt cei adaugati custom doar prezent)
    </li>
    <li>Salvezi modificarile</li>
  </ul>
  <p>
    *aici probabil o sa fac un split intre 2 pagini, vrei sa modifici prezenta unui copil sau o
    grupa intreaga, pentru copil intended doar pentru corecturi. corecturile in masa nu exista
    (cred)
  </p>
</template>
<script setup lang="ts">
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Attendance Management",
});
</script>
