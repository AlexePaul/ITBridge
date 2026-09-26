import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { claimSchema } from "~/composables/useAuthForms";
import { isProtectedRoute } from "~/middleware/01.auth.global";

/**
 * A family the office typed in creates its own account — E11 S2, review of 26 September 2026.
 *
 * `register` used to refuse the office's address as "taken". It now answers with `claimSent` and a
 * link goes to that address; the link's page creates the account on the office's row.
 */
const REGISTER = readFileSync(new URL("../app/pages/auth/register.vue", import.meta.url), "utf8");
const CLAIM = readFileSync(new URL("../app/pages/auth/cont-familie.vue", import.meta.url), "utf8");

const stubApi = (answers: Record<string, unknown>) => {
  const client = vi.fn((url: string) =>
    url in answers ? Promise.resolve(answers[url]) : Promise.reject(new Error(`unexpected ${url}`))
  );
  vi.stubGlobal("$fetch", Object.assign(client, { create: () => client }));
  return client;
};

describe("registering with an address the office already holds", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("stores no tokens and signs nobody in: there is no account yet", async () => {
    const client = stubApi({ "/auth/register": { claimSent: true, message: "…" } });
    const { useAuthApi } = await import("~/composables/api/useAuthApi");
    const { useTokenStore } = await import("~/stores/tokenStore");

    const answer = await useAuthApi().register({
      username: "ana",
      password: "parola123",
      firstName: "Ana",
      lastName: "Pop",
      email: "ana@example.com",
      acceptedTerms: true,
      acceptedUnusualClauses: true,
    });

    expect(answer).toEqual({ claimSent: true, message: "…" });
    expect(client.mock.calls.map(([url]) => url)).toEqual(["/auth/register"]);
    expect(useTokenStore().accessToken).toBeFalsy();
  });

  it("tells the family a link was mailed, instead of sending it to a portal it cannot enter", () => {
    expect(REGISTER).toMatch(/"claimSent" in answer/);
    expect(REGISTER).toMatch(/Familia ta este deja în evidența școlii/);
  });
});

describe("the link's page", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    const { ProfileSetup } = await import("~/composables/useProfileInitialization");
    ProfileSetup.value = false;
  });

  it("signs the new account in and raises the profile-setup gate, as registration does", async () => {
    stubApi({
      "/auth/claim": { accessToken: "acces", refreshToken: "refresh" },
      "/auth/me": { id: 9, role: "PARENT", profileComplete: false },
      "/profiles": [{ id: 4, firstName: "Ana" }],
    });
    const { useAuthApi } = await import("~/composables/api/useAuthApi");
    const { useTokenStore } = await import("~/stores/tokenStore");
    const { ProfileSetup } = await import("~/composables/useProfileInitialization");

    await useAuthApi().claimAccount({
      token: "t",
      username: "ana",
      password: "parola123",
      acceptedTerms: true,
      acceptedUnusualClauses: true,
    });

    expect(useTokenStore().accessToken).toBe("acces");
    expect(useTokenStore().refreshToken).toBe("refresh");
    expect(ProfileSetup.value).toBe(true);
  });

  it("asks what registration asks for an account, both checkboxes included", () => {
    const ok = {
      username: "ana",
      password: "parola",
      acceptedTerms: true,
      acceptedUnusualClauses: true,
    };
    expect(claimSchema.safeParse(ok).success).toBe(true);
    expect(claimSchema.safeParse({ ...ok, acceptedUnusualClauses: false }).success).toBe(false);
    expect(claimSchema.safeParse({ ...ok, password: "scurt" }).success).toBe(false);
  });

  it("is public, stays out of the index, and does not spend the link on load", () => {
    expect(isProtectedRoute("/auth/cont-familie")).toBe(false);
    expect(CLAIM).toMatch(/noindex:\s*true/);
    expect(CLAIM).not.toMatch(/onMounted|useAsyncData|useFetch|callOnce/);
  });
});
