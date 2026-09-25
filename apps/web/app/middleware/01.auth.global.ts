import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import { authInitialized } from "~/plugins/01.auth.client";

/**
 * The gate names what is private, not what is public. With an allow-list of
 * public paths, every new page on the public site was one forgotten line away
 * from redirecting visitors — and search engines — to the login form.
 *
 * `/files` is the link in the email that announces a child's work (E14/S5), and it
 * was missing: a parent opening it on a device with no session got the portal's
 * chrome, a working "Ieși din cont" and an English validator message, instead of
 * the login form. The page requires a login by decision — see its own comment.
 */
export const protectedPrefixes = ["/admin", "/user", "/files"];

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

  // Signed out means *neither* token. The refresh token is the durable half of a session — it
  // outlives the browser closing, while the access token does not — so testing the access token
  // alone would bounce a returning parent whose session is still perfectly valid.
  if (!tokenStore.accessToken && !tokenStore.refreshToken) {
    // The login form is handed the address it interrupted (`inapoi`), so the parent who followed
    // the school's email lands on the work it announced, not on the dashboard with the link to
    // find all over again.
    if (isProtectedRoute(to.path)) {
      return navigateTo({ path: "/auth/login", query: { inapoi: to.fullPath } });
    }
    return;
  }

  return;
});
