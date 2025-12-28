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
    <div class="block items-center justify-center overflow-hidden h-full">
      <UCard
        class="max-w-xl w-full my-[10%] mx-auto p-8 text-center shadow-sm border-primary border"
      >
        <p class="text-xs uppercase tracking-widest text-muted">Error {{ statusCode }}</p>

        <h1 class="mt-4 text-3xl font-semibold text-highlighted">{{ title }}</h1>

        <p class="mt-3 text-muted">
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
