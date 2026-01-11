<script setup lang="ts">
import { computed } from "vue";
import type { NuxtError } from "#app";

const props = defineProps<{ error: NuxtError }>();

const statusCode = computed(() => props.error?.statusCode ?? 500);
const title = computed(() => {
  switch (statusCode.value) {
    case 404:
      return "Page not found";
    case 403:
      return "Access denied";
    case 401:
      return "Unauthorized";
    default:
      return "Something went wrong";
  }
});

const handleError = () => clearError({ redirect: "/" });
</script>

<template>
  <NuxtLayout>
    <div class="flex items-center justify-center overflow-hidden h-full">
      <UCard
        variant="soft"
        class="mt-20 m-5 mx-auto p-4 sm:p-8 md:p-12 text-center shadow-sm w-full"
      >
        <div class="flex justify-center">
          <UIcon name="i-lucide-bug" class="h-12 w-12 text-secondary" />
        </div>

        <h1 class="mt-4 text-3xl font-semibold text-highlighted">{{ title }}</h1>
        <p class="text-sm uppercase tracking-widest text-muted">Error {{ statusCode }}</p>

        <p class="text-xs mt-3 text-muted">
          {{ error?.message || "The page you’re looking for doesn’t exist." }}
        </p>

        <div class="mt-8 flex justify-center gap-3">
          <UButton icon="i-lucide-home" color="primary" variant="solid" @click="handleError">
            Go home
          </UButton>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
            @click="$router.back()"
          >
            Go back
          </UButton>
        </div>
      </UCard>
    </div>
  </NuxtLayout>
</template>
