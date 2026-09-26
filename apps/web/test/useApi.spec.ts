import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `useApi` is the single place every request to the backend goes through, and its refresh logic
 * has two subtleties worth testing: it retries exactly once on a 401, and it de-duplicates
 * concurrent refreshes through a shared `refreshPromise`. Without that de-duplication, ten parallel
 * requests hitting a 401 would trigger ten refreshes, and the last nine would use an already
 * rotated refresh token.
 */

const tokenStore = {
  accessToken: null as string | null,
  refreshToken: "refresh-vechi" as string | null,
  setAccessToken: vi.fn((t: string) => {
    tokenStore.accessToken = t;
  }),
  setRefreshToken: vi.fn(),
  clearTokens: vi.fn(() => {
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
  }),
};

vi.mock("~/stores/tokenStore", () => ({ useTokenStore: () => tokenStore }));

/** An error shaped like the one `$fetch` from ofetch throws. */
const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

let handler: (url: string, opts: Record<string, unknown>) => Promise<unknown>;

beforeEach(async () => {
  tokenStore.accessToken = "acces-vechi";
  tokenStore.refreshToken = "refresh-vechi";
  vi.clearAllMocks();

  const client = vi.fn((url: string, opts: Record<string, unknown>) => handler(url, opts));
  vi.stubGlobal("$fetch", { create: () => client });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiBase: "http://api.test" } }));
});

const loadUseApi = async () => {
  vi.resetModules();
  const mod = await import("~/composables/api/useApi");
  return mod.useApi();
};

describe("useApi", () => {
  it("attaches the access token as a Bearer header", async () => {
    const seen: Record<string, unknown>[] = [];
    handler = (_url, opts) => {
      seen.push(opts);
      return Promise.resolve({ ok: true });
    };

    const api = await loadUseApi();
    await api("/invoices");

    expect((seen[0].headers as Record<string, string>).Authorization).toBe("Bearer acces-vechi");
  });

  it("attaches no header when there is no token", async () => {
    tokenStore.accessToken = null;
    const seen: Record<string, unknown>[] = [];
    handler = (_url, opts) => {
      seen.push(opts);
      return Promise.resolve({});
    };

    const api = await loadUseApi();
    await api("/invoices");

    expect((seen[0].headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("refreshes on a 401 and retries exactly once, with the new token", async () => {
    const calls: string[] = [];
    let firstAttempt = true;

    handler = (url, opts) => {
      calls.push(url);
      if (url === "/auth/refresh") return Promise.resolve({ accessToken: "acces-nou" });
      if (firstAttempt) {
        firstAttempt = false;
        return Promise.reject(httpError(401));
      }
      return Promise.resolve({ header: (opts.headers as Record<string, string>).Authorization });
    };

    const api = await loadUseApi();
    const result = await api<{ header: string }>("/invoices");

    expect(calls).toEqual(["/invoices", "/auth/refresh", "/invoices"]);
    expect(result.header).toBe("Bearer acces-nou");
  });

  /**
   * The visitor who opens the school's email about their child's work on a device with no session:
   * nothing to refresh with, and the attempt used to be made anyway, with `refreshToken: null`. Its
   * 400 — the validator's English, „refreshToken should not be empty" — replaced the 401 the page
   * could have explained (end-to-end testing, 25 September 2026).
   */
  it("hands back the 401 untouched when there is no refresh token to try", async () => {
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
    const calls: string[] = [];
    handler = (url) => {
      calls.push(url);
      return Promise.reject(httpError(401));
    };

    const api = await loadUseApi();
    await expect(api("/projects/link/abc")).rejects.toMatchObject({ status: 401 });

    expect(calls).toEqual(["/projects/link/abc"]);
  });

  it("does not refresh for status codes other than 401", async () => {
    const calls: string[] = [];
    handler = (url) => {
      calls.push(url);
      return Promise.reject(httpError(500));
    };

    const api = await loadUseApi();
    await expect(api("/invoices")).rejects.toThrow();

    expect(calls).toEqual(["/invoices"]);
  });

  it("de-duplicates concurrent refreshes: ten requests, a single refresh", async () => {
    const calls: string[] = [];
    const failedOnce = new Set<string>();
    let releaseRefresh: (v: unknown) => void = () => {};
    const refreshGate = new Promise((resolve) => {
      releaseRefresh = resolve;
    });

    handler = async (url) => {
      calls.push(url);
      if (url === "/auth/refresh") {
        await refreshGate; // hold the refresh open while the other 401s arrive
        return { accessToken: "acces-nou" };
      }
      if (!failedOnce.has(url)) {
        failedOnce.add(url);
        throw httpError(401);
      }
      return { ok: true };
    };

    const api = await loadUseApi();
    const pending = Array.from({ length: 10 }, (_, i) => api(`/resursa-${i}`));

    // Let all ten requests fail with 401 and ask for a refresh, then release the refresh.
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseRefresh(null);
    await Promise.all(pending);

    expect(calls.filter((c) => c === "/auth/refresh")).toHaveLength(1);
    expect(calls.filter((c) => c !== "/auth/refresh")).toHaveLength(20); // 10 failed + 10 retried
  });

  it("clears the tokens when the server turns the refresh down", async () => {
    handler = (url) => {
      if (url === "/auth/refresh") return Promise.reject(httpError(401));
      return Promise.reject(httpError(401));
    };

    const api = await loadUseApi();
    await expect(api("/invoices")).rejects.toMatchObject({ status: 401 });

    expect(tokenStore.clearTokens).toHaveBeenCalled();
  });

  it("hands back the request's own 401 when the refresh is refused as malformed", async () => {
    handler = (url) => {
      if (url === "/auth/refresh") return Promise.reject(httpError(400));
      return Promise.reject(httpError(401));
    };

    const api = await loadUseApi();
    // The 400 is about the refresh token; the screen asked about its own request, which is 401.
    await expect(api("/invoices")).rejects.toMatchObject({ status: 401 });
    expect(tokenStore.clearTokens).toHaveBeenCalled();
  });

  /**
   * One bar of signal in a classroom: the access token has expired, and the one refresh request
   * the phone makes is lost on the network. That used to clear both tokens — the teacher signed out
   * by the network, with a seven-day refresh token that was perfectly good thrown away — and every
   * mark tapped afterwards met a 401 the phone register then read as "the server refused it"
   * (review of 26 September 2026).
   */
  it("keeps the session when the refresh never got an answer", async () => {
    const networkError = new Error("fetch failed");
    handler = (url) => {
      if (url === "/auth/refresh") return Promise.reject(networkError);
      return Promise.reject(httpError(401));
    };

    const api = await loadUseApi();
    await expect(api("/attendance/session/7/child/1")).rejects.toBe(networkError);

    expect(tokenStore.clearTokens).not.toHaveBeenCalled();
    expect(tokenStore.refreshToken).toBe("refresh-vechi");
  });

  it("keeps the session when the refresh meets a server error", async () => {
    handler = (url) => {
      if (url === "/auth/refresh") return Promise.reject(httpError(502));
      return Promise.reject(httpError(401));
    };

    const api = await loadUseApi();
    await expect(api("/invoices")).rejects.toMatchObject({ status: 502 });

    expect(tokenStore.clearTokens).not.toHaveBeenCalled();
  });

  it("does not sign out over the retried request's own failure", async () => {
    let refreshed = false;
    handler = (url) => {
      if (url === "/auth/refresh") {
        refreshed = true;
        return Promise.resolve({ accessToken: "acces-nou" });
      }
      return Promise.reject(httpError(refreshed ? 409 : 401));
    };

    const api = await loadUseApi();
    await expect(api("/enrollments")).rejects.toMatchObject({ status: 409 });

    expect(tokenStore.clearTokens).not.toHaveBeenCalled();
  });

  it("allows a new refresh once the previous one has settled", async () => {
    const calls: string[] = [];
    const failedOnce = new Set<string>();

    handler = (url) => {
      calls.push(url);
      if (url === "/auth/refresh") return Promise.resolve({ accessToken: "acces-nou" });
      if (!failedOnce.has(url)) {
        failedOnce.add(url);
        return Promise.reject(httpError(401));
      }
      return Promise.resolve({ ok: true });
    };

    const api = await loadUseApi();
    await api("/prima");
    await api("/a-doua");

    // `refreshPromise` is cleared in `finally`, so the second round is allowed to refresh again.
    expect(calls.filter((c) => c === "/auth/refresh")).toHaveLength(2);
  });
});

describe("useApi — rotating refresh tokens", () => {
  /**
   * The backend rotates: the refresh token sent to /auth/refresh is consumed and the response
   * carries its successor. Storing only the access token left the spent token in the cookie, so
   * the *next* refresh replayed it, the server read that as theft, revoked the whole session
   * family and the parent was thrown back to the login screen — roughly half an hour into every
   * session, for every user.
   */
  it("stores the rotated refresh token, not just the access token", async () => {
    const sent: unknown[] = [];
    let refreshed = false;
    handler = (url, opts) => {
      if (url === "/auth/refresh") {
        sent.push((opts.body as { refreshToken: string }).refreshToken);
        refreshed = true;
        return Promise.resolve({ accessToken: "acces-nou", refreshToken: "refresh-nou" });
      }
      if (!refreshed) return Promise.reject(httpError(401));
      return Promise.resolve({ ok: true });
    };

    const api = await loadUseApi();
    await api("/invoices");

    expect(sent).toEqual(["refresh-vechi"]);
    expect(tokenStore.setRefreshToken).toHaveBeenCalledWith("refresh-nou");
  });

  it("sends the successor on the next refresh, never the consumed one", async () => {
    const sent: string[] = [];
    let issued = 0;
    let unauthorized = true;
    handler = (url, opts) => {
      if (url === "/auth/refresh") {
        sent.push((opts.body as { refreshToken: string }).refreshToken);
        issued += 1;
        tokenStore.refreshToken = `refresh-${issued}`;
        unauthorized = false;
        return Promise.resolve({
          accessToken: `acces-${issued}`,
          refreshToken: `refresh-${issued}`,
        });
      }
      if (unauthorized) return Promise.reject(httpError(401));
      return Promise.resolve({ ok: true });
    };
    tokenStore.setRefreshToken.mockImplementation((t: string) => {
      tokenStore.refreshToken = t;
    });

    const api = await loadUseApi();
    await api("/invoices");
    unauthorized = true;
    await api("/invoices");

    // The second refresh must not repeat the first token. It used to, which is exactly what the
    // server's reuse detection is built to punish.
    expect(sent).toEqual(["refresh-vechi", "refresh-1"]);
    expect(new Set(sent).size).toBe(sent.length);
  });

  it("shares one refresh across composables, so two of them cannot race the rotation", async () => {
    let refreshCalls = 0;
    let unauthorized = true;
    handler = (url) => {
      if (url === "/auth/refresh") {
        refreshCalls += 1;
        unauthorized = false;
        return Promise.resolve({ accessToken: "acces-nou", refreshToken: "refresh-nou" });
      }
      if (unauthorized) return Promise.reject(httpError(401));
      return Promise.resolve({ ok: true });
    };

    // Two separate useApi() calls, the way two composables on one page each build their own.
    vi.resetModules();
    const mod = await import("~/composables/api/useApi");
    const first = mod.useApi();
    const second = mod.useApi();

    await Promise.all([first("/children"), second("/invoices")]);

    // One rotation, not two. When the promise was per-composable, the loser presented the token the
    // winner had just consumed and the server revoked the family.
    expect(refreshCalls).toBe(1);
  });
});
