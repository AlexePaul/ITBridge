<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";
import { useAuthApi } from "~/composables/api/useAuthApi";
import { useNotifications } from "~/composables/useNotifications";

definePageMeta({
  layout: "default" as any,
});

const badCredentials = ref(false);

const fields: AuthFormField[] = [
  {
    name: "username",
    type: "text",
    label: "username",
    placeholder: "Enter your username",
    required: true,
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    placeholder: "Enter your password",
    required: true,
  },
  {
    name: "remember",
    label: "Remember me",
    type: "checkbox",
  },
];

const schema = z.object({
  username: z.string("Username is required").min(1, "Username is required"),
  password: z.string("Password is required").min(8, "Must be at least 8 characters"),
});

type Schema = z.output<typeof schema>;

const { register } = useAuthApi();
const { success } = useNotifications();
const isLoading = ref(false);

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  isLoading.value = true;
  try {
    const response = await register(payload.data.username, payload.data.password);

    // Show success notification
    success("Welcome!", "Registration successful");

    await navigateTo("/user/profile-setup");
  } catch (error) {
    console.error("Registration failed:", error);
    badCredentials.value = true;
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="mt-20 m-5 p-4 sm:p-8 md:p-10 max-w-3xl w-11/12 border" variant="subtle">
      <template v-if="badCredentials">
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-alert-circle"
          title="Registration Failed"
          description="An account with this username may already exist or the provided information is invalid. Please try again."
        >
        </UAlert>
      </template>

      <UAuthForm
        :schema="schema"
        title="Register"
        description="Enter your credentials to create a new account."
        icon="i-lucide-user"
        :fields="fields"
        :loading="isLoading"
        @submit="onSubmit"
        class="w-full sm:w-[75%] md:w-[50%] mx-auto"
      />
    </UPageCard>
  </div>
</template>
