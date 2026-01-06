import { useUserStore } from "~/stores/userStore";

export default defineNuxtRouteMiddleware(async (to, from) => {
  const userStore = useUserStore();

  if (!userStore.user) {
    return navigateTo("/auth/login");
  }

  if (userStore.user.role !== "ADMIN") {
    return navigateTo("/");
  }
});
