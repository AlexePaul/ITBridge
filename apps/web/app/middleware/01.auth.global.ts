import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { authInitialized } from "~/plugins/01.auth.client";

/**
 * The gate names what is private, not what is public. With an allow-list of
 * public paths, every new page on the public site was one forgotten line away
 * from redirecting visitors — and search engines — to the login form.
 */
export const protectedPrefixes = ["/admin", "/user"];

export const isProtectedRoute = (path: string) =>
  protectedPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

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
    if (isProtectedRoute(to.path)) {
      return navigateTo("/auth/login");
    }
    return;
  }

  return;
});
