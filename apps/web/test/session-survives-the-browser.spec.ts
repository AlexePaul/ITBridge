import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPinia, setActivePinia } from "pinia";
import { useTokenStore } from "~/stores/tokenStore";

/**
 * A login that survives the browser closing needs three things, and two of them had no test.
 *
 * The cookie was given a lifetime, and `stores.spec.ts` guards that. But a durable refresh cookie
 * on its own changes nothing: both places that decide „is somebody signed in" asked the **access**
 * token, which is session-scoped by design and therefore exactly the half a returning parent no
 * longer has. Read that way, they sent the family to the login form with a perfectly good
 * seven-day token sitting unused in the jar — nothing calls `/auth/refresh` until a request 401s,
 * and no request was being made.
 *
 * So the assertion here is not about cookies. It is that the two readers consult the durable half.
 * Reverting either to `!tokenStore.accessToken` puts the bug back with the cookie fix still in
 * place, and without these that revert is silent.
 */
describe("a session that outlives the browser", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    (globalThis.navigateTo as ReturnType<typeof vi.fn>).mockClear();
  });

  describe("the global middleware", () => {
    /**
     * Imported inside the tests rather than at the top: the module reads `authInitialized` from the
     * boot plugin at import time, and the stubs it needs are installed by `test/setup.ts`.
     */
    const load = async () => {
      const [middleware, plugin] = await Promise.all([
        import("~/middleware/01.auth.global"),
        import("~/plugins/01.auth.client"),
      ]);
      // The chain exits early until the plugin has run; every case below is about what happens after.
      plugin.authInitialized.value = true;
      return middleware.default as (to: { path: string }, from: { path: string }) => unknown;
    };

    const visit = async (path: string) => (await load())({ path }, { path: "/" });

    it("lets a returning parent through on the refresh token alone", async () => {
      useTokenStore().setRefreshToken("a-seven-day-token");

      await visit("/admin/children");

      // The access cookie died with the browser; the session did not.
      expect(globalThis.navigateTo).not.toHaveBeenCalled();
    });

    it("still sends a genuinely signed-out visitor to the login form", async () => {
      await visit("/admin/children");

      expect(globalThis.navigateTo).toHaveBeenCalledWith("/auth/login");
    });

    it("leaves the public site alone either way", async () => {
      await visit("/cursuri");

      expect(globalThis.navigateTo).not.toHaveBeenCalled();
    });
  });

  /**
   * The boot plugin is checked by reading it rather than running it: invoking it pulls in
   * `userStore.fetchUser`, and a test that stubbed the whole API layer would be asserting its own
   * scaffolding. What must not come back is the *shape* — a condition that names only the access
   * token — and that is on the page.
   */
  describe("the boot plugin", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../app/plugins/01.auth.client.ts", import.meta.url)),
      "utf8"
    );

    it("asks whether either token is present before restoring the session", () => {
      const condition = /if\s*\(([^)]*tokenStore[^)]*)\)/.exec(source)?.[1] ?? "";

      expect(condition).toContain("accessToken");
      expect(condition).toContain("refreshToken");
    });
  });
});
