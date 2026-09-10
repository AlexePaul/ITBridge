import { useUserStore } from "~/stores/userStore";
import { ProfileSetup } from "~/composables/useProfileInitialization";
import { authInitialized } from "~/plugins/01.auth.client";
import { isProtectedRoute } from "./01.auth.global";

/** Where a family accepts a version of a document it has not accepted yet. */
export const LEGAL_ACCEPTANCE_ROUTE = "/user/termeni-noi";

/**
 * What terms §18 promises: at the first sign-in after a new version, the portal asks for it.
 *
 * The list of what is outstanding comes from `/auth/me` — the server derived it, this file only
 * reads it. That is the same arrangement `profileComplete` has and it is load-bearing here too:
 * the endpoint that records an acceptance decides what is still missing, so a screen holding its
 * own copy of the rule could release a parent the ledger still considers pending.
 *
 * **It yields while the profile-setup gate is holding**, and that is not politeness — it is the
 * only thing standing between two global middlewares and an infinite redirect. Both run on every
 * navigation, in file-name order: with both pending, `02` sends the parent to `/user/profile-setup`,
 * this one would send them from there to `/user/termeni-noi`, and `02` would send them straight
 * back. The precedence is written here, in the file that arrived second, rather than teaching the
 * older gate about this one.
 */
export default defineNuxtRouteMiddleware((to) => {
  if (!authInitialized.value) {
    return;
  }

  // The public site is never interrupted, exactly as it is not by the gate above.
  if (!isProtectedRoute(to.path)) {
    return;
  }

  if (ProfileSetup.value) {
    return;
  }

  const userStore = useUserStore();
  const outstanding = userStore.user?.pendingLegalDocuments ?? [];

  if (outstanding.length > 0 && to.path !== LEGAL_ACCEPTANCE_ROUTE) {
    return navigateTo(LEGAL_ACCEPTANCE_ROUTE);
  }

  // Nothing outstanding is never a redirect, not even on the acceptance screen itself. Bouncing
  // off it would make the page unreachable for anyone who has nothing to accept — an admin, or a
  // parent who has just finished — and `check-a11y-auth.mjs` signs in as the admin, so the screen
  // would quietly never be measured while the run reported every route visited. The page says so
  // itself instead, which is also the honest answer to somebody who typed the address.
});
