import type {
  RouteLocationAsRelativeGeneric,
  RouteLocationAsPathGeneric,
  NavigationFailure,
} from "vue-router";
import { useTokens } from "~/composables/useTokens";
import { useUserStore } from "~/composables/useUserStore";

// middleware/auth.ts
export default defineNuxtRouteMiddleware(async (to, from) => {
  // Skip middleware for login and auth pages
  if (to.path.includes("/Auth/login") || to.path.includes("/auth/login")) {
    return;
  }

  const { user } = useUserStore();
  const { accessToken } = useTokens();

  // If no token, user is not logged in
  if (!accessToken.value) {
    // Redirect to login if trying to access protected pages
    if (to.path !== "/" && to.path !== "/auth/login") {
      return navigateTo("/auth/login");
    }
    return;
  }

  // If user data is not loaded yet, fetch it
  if (!user.value) {
    try {
      await useUserStore().fetchUser();
    } catch (error) {
      console.error("Failed to fetch user:", error);
      return navigateTo("/auth/login");
    }
  }

  // Redirect based on role for home page
  if (to.path === "/" && user.value) {
    if (user.value.role === "ADMIN") {
      return navigateTo("/dashboard/admin");
    } else if (user.value.role === "PARENT") {
      return navigateTo("/dashboard/parent");
    }
  }
});
