import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { safeReturnPath } from "~/composables/useReturnPath";
import { looksLikeEmail, looksLikePhone } from "~/composables/useUtils";

/**
 * The ways into the portal that the end-to-end testing of 25 September 2026 found open: the link in
 * the school's email about a child's work, reached with no session, and the registration that
 * skipped step two.
 */
describe("where the login form sends someone back to", () => {
  it("is the page it interrupted, when that is a page of this site", () => {
    expect(safeReturnPath("/files/eb4428a0-3849-4f05-943c-b1355d5d34e8")).toBe(
      "/files/eb4428a0-3849-4f05-943c-b1355d5d34e8"
    );
    expect(safeReturnPath("/user/proiecte?copil=2")).toBe("/user/proiecte?copil=2");
  });

  it("is nowhere a link to our login form could point a parent after they type their password", () => {
    expect(safeReturnPath("https://exemplu.ro/parola")).toBeNull();
    expect(safeReturnPath("//exemplu.ro/parola")).toBeNull();
    expect(safeReturnPath("/\\exemplu.ro")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
  });

  it("is not the login form itself, nor anything that is not a single path", () => {
    expect(safeReturnPath("/auth/login")).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath(["/user/dashboard", "/admin"])).toBe("/user/dashboard");
  });
});

describe("the gate in front of the portal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    (globalThis.navigateTo as ReturnType<typeof vi.fn>).mockClear();
  });

  const visitSignedOut = async (path: string) => {
    const [middleware, plugin] = await Promise.all([
      import("~/middleware/01.auth.global"),
      import("~/plugins/01.auth.client"),
    ]);
    plugin.authInitialized.value = true;
    const to = { path, fullPath: path };
    return (middleware.default as (to: unknown, from: unknown) => unknown)(to, { path: "/" });
  };

  it("sends a visitor with no session from the emailed link to the login form, and remembers it", async () => {
    await visitSignedOut("/files/eb4428a0-3849-4f05-943c-b1355d5d34e8");

    expect(globalThis.navigateTo).toHaveBeenCalledWith({
      path: "/auth/login",
      query: { inapoi: "/files/eb4428a0-3849-4f05-943c-b1355d5d34e8" },
    });
  });

  it("still leaves the public site alone", async () => {
    await visitSignedOut("/proba");

    expect(globalThis.navigateTo).not.toHaveBeenCalled();
  });
});

describe("registering", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { ProfileSetup } = await import("~/composables/useProfileInitialization");
    ProfileSetup.value = false;
  });

  /**
   * `register.vue` went straight from the request to the dashboard, and the flag the profile-setup
   * gate reads was still `false` from boot — so a family that had just signed up, with no phone, no
   * address and no emergency contact, was never sent to the step that cannot be skipped.
   */
  it("raises the profile-setup gate before anybody navigates", async () => {
    const client = vi.fn((url: string) => {
      if (url === "/auth/register")
        return Promise.resolve({ accessToken: "acces", refreshToken: "refresh" });
      if (url === "/auth/me")
        return Promise.resolve({ id: 7, role: "PARENT", profileComplete: false });
      if (url === "/profiles") return Promise.resolve([{ id: 7, firstName: "Ana" }]);
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    vi.stubGlobal("$fetch", Object.assign(client, { create: () => client }));

    const { useAuthApi } = await import("~/composables/api/useAuthApi");
    const { ProfileSetup } = await import("~/composables/useProfileInitialization");
    await useAuthApi().register({
      username: "ana",
      password: "parola123",
      firstName: "Ana",
      lastName: "Pop",
      email: "ana@example.com",
      acceptedTerms: true,
      acceptedPrivacy: true,
      acceptedUnusualClauses: true,
    } as never);

    expect(ProfileSetup.value).toBe(true);
  });
});

describe("the booking form's own check of a contact", () => {
  it("catches the typo and nothing the server would take", () => {
    expect(looksLikeEmail("nu-e-email-valid")).toBe(false);
    expect(looksLikeEmail("ioana@exemplu")).toBe(false);
    expect(looksLikeEmail(" ioana@exemplu.ro ")).toBe(true);

    expect(looksLikePhone("12")).toBe(false);
    expect(looksLikePhone("07xx xxx xxx")).toBe(false);
    expect(looksLikePhone("0712 345 678")).toBe(true);
    expect(looksLikePhone("021 123 4567")).toBe(true);
    expect(looksLikePhone("+44 20 7946 0958")).toBe(true);
  });
});
