<template>
  <AdminPage title="Prezența" subtitle="Marchează ora care se ține acum, sau caută în istoric.">
    <!-- Stacked on a phone and three across from `sm` up. It used to be three `w-1/3` columns at
         every width, so on a 390px screen each card was 130px wide and every title broke into
         four lines. A teacher opens this standing up. -->
    <div class="grid gap-4 sm:grid-cols-3">
      <NuxtLink
        v-for="choice in choices"
        :key="choice.to"
        :to="choice.to"
        class="border-muted hover:border-primary flex flex-col justify-between gap-4 rounded-lg border p-5 text-center transition-colors"
      >
        <div>
          <UIcon :name="choice.icon" class="text-primary mx-auto mb-3 text-4xl" />
          <h2 class="text-xl font-bold">{{ choice.title }}</h2>
          <p class="text-muted mt-2 text-sm">{{ choice.description }}</p>
        </div>
        <p class="text-dimmed mt-4 text-xs">{{ choice.hint }}</p>
      </NuxtLink>
    </div>
  </AdminPage>
</template>

<script setup lang="ts">
/**
 * The three doors into attendance.
 *
 * "Prezența de azi" is first and named as the phone one (E18/S7): it is the screen a teacher uses
 * in the room, and until now this page did not offer it at all — it was reachable only from the
 * sidebar, which is exactly the thing a phone hides behind a button. Somebody who lands here on a
 * phone is almost certainly about to mark the class that is starting.
 *
 * Each card promises only what its screen does (review of 26 September 2026). The group card said
 * "pe orice zi din orar" and the child card "consultă și corectează", while the group screen offers
 * only unmarked classes from the last four weeks and the child's history is read-only — so a
 * register half-taken on the phone could be finished nowhere. The phone screen now opens any past
 * day as well, and it is the door named for completing and correcting.
 */
definePageMeta({
  layout: "dashboard" as any,
  middleware: "admin-check" as any,
  title: "Prezența",
});

const choices = [
  {
    to: "/admin/attendance/azi",
    icon: "i-lucide-smartphone",
    title: "Prezența de azi",
    description: "Orele de azi, marcate de pe telefon, din sală — sau ale unei zile trecute.",
    hint: "Aici se completează și se corectează un catalog început; marcajele se retrimit singure dacă pică rețeaua",
  },
  {
    to: "/admin/attendance/group",
    icon: "i-lucide-users",
    title: "Prezența unei grupe",
    description: "Catalogul întreg al unei ore încă nemarcate, din ultimele patru săptămâni.",
    hint: "Alege grupa și ora, apoi marchează toți copiii deodată",
  },
  {
    to: "/admin/attendance/children",
    icon: "i-lucide-user",
    title: "Prezența unui copil",
    description: "Istoricul unui singur copil, cu recuperările lui.",
    hint: "Doar pentru citit; o corectură se face în catalogul orei",
  },
];
</script>
