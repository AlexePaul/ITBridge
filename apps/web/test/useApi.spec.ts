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

  it("clears the tokens when the refresh itself fails", async () => {
    handler = (url) => {
      if (url === "/auth/refresh") return Promise.reject(httpError(401));
      return Promise.reject(httpError(401));
    };

    const api = await loadUseApi();
    await expect(api("/invoices")).rejects.toThrow();

    expect(tokenStore.clearTokens).toHaveBeenCalled();
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
