import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useTokenStore } from "~/stores/tokenStore";

/**
 * A reload on a bad network used to sign the family out (review of 26 September 2026): the boot
 * plugin cleared both tokens on any failure of `/auth/me`, so a request lost on one bar of signal
 * threw away a seven-day refresh token. `useApi` was fixed the same way the day before: the tokens
 * go only when the server refuses the session — a 401, or a 400 from a refused refresh.
 */
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

const stubApi = (answer: (url: string) => Promise<unknown>) => {
  const client = vi.fn(answer);
  vi.stubGlobal("$fetch", Object.assign(client, { create: () => client }));
};

const boot = async () => {
  const plugin = (await import("~/plugins/01.auth.client")).default as unknown as (
    app: unknown
  ) => Promise<void>;
  await plugin({});
};

describe("restoring the session at boot", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const tokens = useTokenStore();
    tokens.clearTokens();
    tokens.setAccessToken("acces");
    tokens.setRefreshToken("refresh", true);
  });

  it("keeps the tokens when the request never got an answer", async () => {
    stubApi(() => Promise.reject(new TypeError("fetch failed")));

    await boot();

    expect(useTokenStore().refreshToken).toBe("refresh");
  });

  it("keeps them when the server is restarting", async () => {
    stubApi(() => Promise.reject(httpError(502)));

    await boot();

    expect(useTokenStore().refreshToken).toBe("refresh");
  });

  it("drops them when the server refuses the session", async () => {
    // `/auth/me` answers 401, and so does the refresh `useApi` tries before giving up.
    stubApi(() => Promise.reject(httpError(401)));

    await boot();

    expect(useTokenStore().refreshToken).toBeNull();
    expect(useTokenStore().accessToken).toBeNull();
  });
});
