import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { CurrentUser } from "~/types/user.types";

/**
 * An account created from a claim link, waiting for the office to attach it to its family — the
 * review of 26 September 2026.
 *
 * Until the office approves it the account has no family: every page but the home one would be an
 * empty page that reads like a lost family, and step two of registration would write it a second
 * one. The home page says why it is empty; the rest of the portal sends it there.
 */
const DASHBOARD = readFileSync(new URL("../app/pages/user/dashboard.vue", import.meta.url), "utf8");
const NAV = readFileSync(new URL("../app/components/PortalNav.vue", import.meta.url), "utf8");
const NOTICE = readFileSync(
  new URL("../app/components/AccountStatusNotice.vue", import.meta.url),
  "utf8"
);

describe("an account waiting to be attached to its family", () => {
  const waiting = {
    id: 9,
    username: "ana",
    role: "PARENT",
    createdAt: "2026-09-26T00:00:00.000Z",
    emailConfirmed: true,
    approvalStatus: "PENDING",
    active: false,
    profileComplete: false,
    awaitingFamily: true,
    pendingLegalDocuments: [],
  } as unknown as CurrentUser;

  /** Seeds the store the way the app does, through `fetchUser`. */
  const signedIn = async (user: CurrentUser) => {
    const client = vi.fn(() => Promise.resolve(user));
    vi.stubGlobal("$fetch", Object.assign(client, { create: () => client }));
    const { useUserStore } = await import("~/stores/userStore");
    await useUserStore().fetchUser();
  };

  const visit = async (path: string) => {
    const [middleware, plugin] = await Promise.all([
      import("~/middleware/02.profile-setup.global"),
      import("~/plugins/01.auth.client"),
    ]);
    plugin.authInitialized.value = true;
    return (middleware.default as (to: { path: string }, from: { path: string }) => unknown)(
      { path },
      { path: "/" }
    );
  };

  beforeEach(async () => {
    setActivePinia(createPinia());
    (globalThis.navigateTo as ReturnType<typeof vi.fn>).mockClear();
    const { ProfileSetup } = await import("~/composables/useProfileInitialization");
    ProfileSetup.value = false;
  });

  it("is sent to the portal's home from any other page of the portal", async () => {
    await signedIn(waiting);

    await visit("/user/payments");

    expect(globalThis.navigateTo).toHaveBeenCalledWith("/user/dashboard");
  });

  it("stays on the home page, and may open the new-terms page the legal gate sends it to", async () => {
    await signedIn(waiting);

    await visit("/user/dashboard");
    await visit("/user/termeni-noi");

    // A redirect each way between this gate and the legal one would be a loop with no error.
    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });

  it("leaves an attached family's portal alone", async () => {
    await signedIn({
      ...waiting,
      awaitingFamily: false,
      profileComplete: true,
      approvalStatus: "APPROVED",
      active: true,
    } as CurrentUser);

    await visit("/user/payments");

    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });

  it("is offered only the tabs it can open, and a home page that loads nothing of a family", () => {
    expect(NAV).toMatch(
      /awaitingFamily\s*\?\s*allTabs\.filter\(\(tab\) => AWAITING_FAMILY_PAGES\.includes\(tab\.to\)\)/
    );
    expect(DASHBOARD).toMatch(
      /if \(awaitingFamily\.value\) \{\s*loading\.value = false;\s*return;/
    );
  });

  it("is told that the family's data appears once the school attaches the account", () => {
    expect(NOTICE).toMatch(/Un coleg confirmă că acest cont e al familiei tale/);
    expect(NOTICE).toMatch(/copiii, prezența și facturile apar după\s+ce școala leagă contul/);
  });
});
