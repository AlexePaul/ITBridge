import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { authInitialized } from "~/plugins/auth.client";

// middleware/auth.ts
export default defineNuxtRouteMiddleware(async (to, from) => {
  // Wait for auth to be initialized
  if (!authInitialized.value) {
    return;
  }

  const userStore = useUserStore();
  const tokenStore = useTokenStore();

  // If logged in and trying to access login/register, redirect to home
  if (userStore.user && (to.path.includes("/auth/login") || to.path.includes("/auth/register"))) {
    return navigateTo("/");
  }

  // Skip middleware for login and auth pages
  if (to.path.includes("/auth/login") || to.path.includes("/auth/register")) {
    return;
  }

  // If no token, user is not logged in
  if (!tokenStore.accessToken) {
    // Redirect to login if trying to access protected pages
    if (to.path !== "/" && to.path !== "/auth/login") {
      return navigateTo("/auth/login");
    }
    return;
  }

  return;
});
