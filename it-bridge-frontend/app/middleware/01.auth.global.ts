import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { authInitialized } from "~/plugins/01.auth.client";

export const unauthenticatedRoutes = ["/", "/auth/login", "/auth/register", "/courses"];

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

  // Skip middleware for login and register pages
  if (to.path.includes("/auth/login") || to.path.includes("/auth/register")) {
    return;
  }

  // If no token, user is not logged in
  if (!tokenStore.accessToken) {
    // Redirect to login if trying to access protected pages
    if (!unauthenticatedRoutes.includes(to.path)) {
      return navigateTo("/auth/login");
    }
    return;
  }

  return;
});
