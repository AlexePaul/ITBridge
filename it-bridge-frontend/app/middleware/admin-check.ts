import { authInitialized } from "~/plugins/01.auth.client";
import { useUserStore } from "~/stores/userStore";

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Server-side: skip, plugin is client-only; client nav will enforce
  if (import.meta.server) return;

  // Block until auth initialization completes
  if (!authInitialized.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(authInitialized, (v) => {
        if (v) {
          stop();
          resolve();
        }
      });
    });
  }

  const userStore = useUserStore();

  if (!userStore.user) {
    return navigateTo("/auth/login");
  }

  if (userStore.user.role !== "ADMIN") {
    return navigateTo("/");
  }
});
