import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CurrentUser } from "~/types/user.types";
import type { LegalDocumentKey } from "~/types/legal.types";

/**
 * The gate terms §18 promises — E22 S4, second half: a version a family has not accepted is asked
 * for at the first sign-in after it.
 *
 * Three of these are about the redirect. The fourth is about the one way two global middlewares can
 * ruin a portal: `02.profile-setup.global.ts` sends a parent with an unfinished profile to its own
 * form, and this one would send them from that form to the acceptance screen, from which `02` would
 * send them straight back. A loop with no error and no log — the browser simply stops. It takes
 * both gates open at once, which is a family that registered, never finished step two, and was
 * still there when a document moved: rare, and permanent for whoever hits it.
 */
describe("the legal re-acceptance gate", () => {
  /** What `/auth/me` answers, for a parent with these documents outstanding. */
  const currentUser = (pendingLegalDocuments: LegalDocumentKey[]): CurrentUser =>
    ({
      id: 3,
      username: "ana",
      role: "PARENT",
      createdAt: "2026-01-01T00:00:00.000Z",
      emailConfirmed: true,
      approvalStatus: "APPROVED",
      active: true,
      profileComplete: true,
      pendingLegalDocuments,
    }) as unknown as CurrentUser;

  /**
   * Seeds the store the way the app does — through `fetchUser` — because its state is handed out
   * `readonly` and a spec that reached past that would be testing a store this app never has.
   */
  const signedInWith = async (pendingLegalDocuments: LegalDocumentKey[]) => {
    const client = vi.fn(() => Promise.resolve(currentUser(pendingLegalDocuments)));
    vi.stubGlobal("$fetch", Object.assign(client, { create: () => client }));

    const { useUserStore } = await import("~/stores/userStore");
    await useUserStore().fetchUser();
  };

  const load = async () => {
    const [middleware, plugin] = await Promise.all([
      import("~/middleware/03.legal-acceptance.global"),
      import("~/plugins/01.auth.client"),
    ]);
    plugin.authInitialized.value = true;
    return middleware.default as (to: { path: string }, from: { path: string }) => unknown;
  };

  const visit = async (path: string) => (await load())({ path }, { path: "/" });

  beforeEach(async () => {
    setActivePinia(createPinia());
    (globalThis.navigateTo as ReturnType<typeof vi.fn>).mockClear();
    const { ProfileSetup } = await import("~/composables/useProfileInitialization");
    ProfileSetup.value = false;
  });

  it("sends a parent with an outstanding document to the acceptance screen", async () => {
    await signedInWith(["terms"]);

    await visit("/user/dashboard");

    expect(globalThis.navigateTo).toHaveBeenCalledWith("/user/termeni-noi");
  });

  it("leaves a parent with nothing outstanding where they were going", async () => {
    await signedInWith([]);

    await visit("/user/dashboard");

    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });

  it("never interrupts the public site, however much is outstanding", async () => {
    await signedInWith(["terms", "privacy", "unusual_clauses"]);

    await visit("/cursuri");

    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });

  it("does not bounce the parent off the acceptance screen it just sent them to", async () => {
    await signedInWith(["terms"]);

    await visit("/user/termeni-noi");

    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });

  it("leaves the acceptance screen reachable with nothing to accept", async () => {
    // An admin, or a parent who has just confirmed. Redirecting them away would make the page
    // unreachable for everyone who has nothing outstanding — including `check-a11y-auth.mjs`,
    // which signs in as the admin, so the screen would never be measured while the run reported
    // every route visited. The page says "nothing to accept" itself.
    await signedInWith([]);

    await visit("/user/termeni-noi");

    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });

  it("yields while the profile-setup gate is holding, so the two cannot loop", async () => {
    await signedInWith(["terms"]);
    const { ProfileSetup } = await import("~/composables/useProfileInitialization");
    ProfileSetup.value = true;

    // The other gate has sent the parent here and will send them back on every navigation. This
    // one has to let go, or the two redirect at each other for as long as the tab is open.
    await visit("/user/profile-setup");

    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });
});
