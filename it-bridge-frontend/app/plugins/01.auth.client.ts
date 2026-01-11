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
    console.log("Auth plugin: Token found, fetching user...");
    try {
      await userStore.fetchUser();
      console.log("Auth plugin: User fetched successfully", userStore.user);
    } catch (error) {
      console.error("Auth plugin: Failed to fetch user:", error);
      // Clear invalid tokens if fetch fails
      tokenStore.clearTokens();
      userStore.logout();
    }
  } else {
    console.log("Auth plugin: No token found");
  }

  // Mark auth check as complete
  authInitialized.value = true;
});
