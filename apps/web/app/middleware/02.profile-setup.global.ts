import { authInitialized } from "~/plugins/01.auth.client";
import { ProfileSetup } from "~/composables/useProfileInitialization";
import { isProtectedRoute } from "./01.auth.global";

// middleware/profile-setup.ts
export default defineNuxtRouteMiddleware(async (to, from) => {
  if (!authInitialized.value) {
    return;
  }

  // The public site is never interrupted by the profile-setup redirect.
  if (!isProtectedRoute(to.path)) {
    return;
  }

  if (!ProfileSetup.value && to.path === "/user/profile-setup") {
    return navigateTo("/");
  }

  if (ProfileSetup.value && to.path !== "/user/profile-setup") {
    return navigateTo("/user/profile-setup");
  }
  return;
});
