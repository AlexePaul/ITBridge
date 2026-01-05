import { useUserStore } from "~/stores/userStore";

export default defineNuxtRouteMiddleware(async (to, from) => {
  const userStore = useUserStore();

  if (!userStore.user) {
    console.log("[Admin Check] User not loaded, redirecting to login");
    return navigateTo("/auth/login");
  }

  if (userStore.user.role !== "ADMIN") {
    console.log("[Admin Check] User is not admin:", userStore.user.role);
    return navigateTo("/");
  }

  console.log("[Admin Check] ✓ Admin access granted");
});
