<template>
  <div v-if="authInitialized" class="min-h-screen flex flex-col">
    <!-- Single Navbar (shows different buttons based on auth state) -->
    <Navbar />

    <UCard
      v-if="overdueInvoices"
      class="w-9/12 md:1/3 mx-auto border border-error rounded-none mt-32 mb-8 z-15"
      variant="subtle"
    >
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-2 sm:flex-1">
          <UIcon
            name="i-lucide-alert-circle"
            class="text-error shrink-0 text-xl md:text-2xl lg:text-3xl self-center"
          />
          <p class="font-bold text-lg">
            Au fost detectate facturi restante, daca aceasta este o greseala, nu ezitati sa ne
            contactati.
          </p>
        </div>
        <NuxtLink
          to="/user/payments"
          class="underline text-sm text-error font-semibold whitespace-nowrap self-start sm:self-center sm:ml-4"
        >
          Acceseaza istoricul plăților
        </NuxtLink>
      </div>
    </UCard>
    <UCard
      v-else-if="pendingInvoices"
      class="w-9/12 md:1/3 mx-auto border border-warning rounded-none mt-32 mb-8 z-15"
      variant="subtle"
    >
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div class="flex items-center gap-2 sm:flex-1">
          <UIcon
            name="i-lucide-alert-circle"
            class="text-warning shrink-0 text-xl md:text-2xl lg:text-3xl self-center"
          />
          <p class="font-bold text-lg">
            Aveti facturi care necesita plata. Va rugam sa accesati istoricul plăților pentru
            detalii.
            <br />Daca aceasta este o greseala, nu ezitati sa ne contactati.
          </p>
        </div>
        <NuxtLink
          to="/user/payments"
          class="underline text-sm text-warning font-semibold whitespace-nowrap self-start sm:self-center sm:ml-4"
        >
          Acceseaza istoricul plăților
        </NuxtLink>
      </div>
    </UCard>
    <!-- Main Content -->
    <main class="flex-1 mt-16">
      <slot />
    </main>

    <!-- Footer -->
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from "~/stores/userStore";
import { authInitialized } from "~/plugins/01-auth.client";
import { overdueInvoices, pendingInvoices } from "~/plugins/02-payments.client";

const userStore = useUserStore();
</script>
