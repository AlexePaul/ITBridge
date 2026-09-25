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
   * The redirect below is the second step of registering, and it cannot be skipped (E20, in
   * CLAUDE.md under "Înregistrarea are doi pași"): `ProfileSetup` is `profileComplete === false`,
   * read from the server, so a family with an account and no phone, address or emergency contact
   * is sent here from anywhere in the portal until the form is filled — the same answer the
   * enrolment endpoint gives with `PARENT_PROFILE_INCOMPLETE`. This comment used to say the
   * opposite, from before that decision, and read like a bug report against the line under it.
   */
  if (ProfileSetup.value && to.path !== "/user/profile-setup") {
    return navigateTo("/user/profile-setup");
  }
  return;
});
