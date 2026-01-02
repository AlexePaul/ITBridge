import { authInitialized } from "~/plugins/01.auth.client";
import { ProfileSetup } from "~/plugins/03.profile.client";
import { unauthenticatedRoutes } from "./01.auth.global";

// middleware/profile-setup.ts
export default defineNuxtRouteMiddleware(async (to, from) => {
  if (!authInitialized.value) {
    return;
  }

  if (unauthenticatedRoutes.includes(to.path)) {
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
