import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";

// Create a global ref for auth initialization
export const authInitialized = ref(false);

// plugins/auth.client.ts
export default defineNuxtPlugin(async (nuxtApp) => {
  const tokenStore = useTokenStore();
  const userStore = useUserStore();

  // If there's an access token, fetch the user profile
  if (tokenStore.accessToken) {
    try {
      await userStore.fetchUser();
    } catch (error) {
      console.error("Auth plugin: Failed to fetch user:", error);
      // Clear invalid tokens if fetch fails
      tokenStore.clearTokens();
      userStore.logout();
    }
  }

  // Mark auth check as complete
  authInitialized.value = true;
});
