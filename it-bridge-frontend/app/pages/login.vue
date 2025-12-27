<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";
import { useAuthApi } from "~/composables/useAuthApi";
const { loggedIn, session, user, clear, fetch } = useUserSession();

definePageMeta({
  layout: "guest" as any,
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

const { login } = useAuthApi();
const isLoading = ref(false);

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  isLoading.value = true;
  try {
    const response = await login(payload.data.username, payload.data.password);

    console.log("Login successful:", response);

    // Refresh the session on client-side and redirect to the home page
    await fetch();
    await navigateTo("/");
  } catch (error) {
    console.error("Login failed:", error);
    badCredentials.value = true;
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-lg">
      <template v-if="badCredentials">
        <AlertError
          title="Invalid Credentials"
          description="The username or password you entered is incorrect. Please try again."
          @close="badCredentials = false"
          class="mb-4"
        />
      </template>

      <UAuthForm
        :schema="schema"
        title="Login"
        description="Enter your credentials to access your account."
        icon="i-lucide-user"
        :fields="fields"
        :loading="isLoading"
        @submit="onSubmit"
      />
    </UPageCard>
  </div>
</template>
