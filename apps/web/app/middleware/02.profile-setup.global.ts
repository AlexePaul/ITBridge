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

  /*
   * A parent who already has a profile is no longer bounced off this page — E18/S4, screen 6b.
   *
   * The redirect assumed the page could only ever mean "you have no profile, make one". It has two
   * entries now, and this guard blocked the second of them outright: a family the school entered
   * from a phone call *does* have a profile row — with no phone, no address and no emergency
   * contact — so `ProfileSetup` is false for exactly the people the screen was written for, and
   * every route to it, including "Modifică datele" on Profil, ended at the home page.
   *
   * What is deliberately unchanged is the redirect below it. Having no profile at all still forces
   * the form, because nothing else in the portal works without one; having an incomplete profile
   * does not, because trapping a family in a blocking form over a field they were never asked for
   * is a product decision, not a screen.
   */
  if (ProfileSetup.value && to.path !== "/user/profile-setup") {
    return navigateTo("/user/profile-setup");
  }
  return;
});
