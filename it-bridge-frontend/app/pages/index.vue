<template>
  <template>
    <div class="flex">
      <UAlert v-if="showLoginSuccess" color="success" variant="subtle">
        <template #description>
          <div class="flex justify-between w-full">
            <b>Welcome back!</b>
            <span>Login successful</span>
          </div>
        </template>
      </UAlert>

      <!-- Rest of page -->
    </div>
  </template>
  <h1>Welcome to IT Bridge School</h1>
</template>
<script setup lang="ts">
const route = useRoute();
const showLoginSuccess = computed(() => route.query.loginSuccess === "true");

definePageMeta({
  layout: "guest" as any,
  middleware: "auth" as any,
});

// Clear the query param after showing the message
onMounted(() => {
  if (showLoginSuccess.value) {
    // Show success for 3 seconds then remove param
    setTimeout(() => {
      navigateTo({ path: "/" });
    }, 3000);
  }
});
</script>
