import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { refreshRejected } from "~/composables/api/useApi";

// Create a global ref for auth initialization
export const authInitialized = ref(false);

// plugins/auth.client.ts
export default defineNuxtPlugin(async (nuxtApp) => {
  const tokenStore = useTokenStore();
  const userStore = useUserStore();

  /*
   * Either token means there is a session to restore — not the access token alone.
   *
   * The access token is session-scoped and fifteen minutes long, so a parent coming back the next
   * morning has only the refresh cookie left. Read as "no access token, nobody is signed in", that
   * sent them to the login form with a perfectly good seven-day token sitting in the jar, unused,
   * because nothing ever calls `/auth/refresh` until a request 401s and no request was being made.
   * Asking anyway is what reaches it: `/auth/me` answers 401, `useApi` refreshes, and the retry
   * carries the new token.
   */
  if (tokenStore.accessToken || tokenStore.refreshToken) {
    try {
      await userStore.fetchUser();
    } catch (error) {
      console.error("Auth plugin: Failed to fetch user:", error);
      // Only a refusal ends the session — `/auth/me` answering 401 once a refresh was turned down or
      // impossible, or a 400 — the rule `useApi` follows for `/auth/refresh` (review of 26 September
      // 2026). Any failure used to clear both tokens, so a reload on one bar of signal, or during a
      // 502 while the API restarted, signed the family out and threw away a seven-day refresh token.
      // Kept, the next reload or the next request restores the session.
      if (refreshRejected(error)) {
        tokenStore.clearTokens();
        userStore.logout();
      }
    }
  }

  // Mark auth check as complete
  authInitialized.value = true;
});
