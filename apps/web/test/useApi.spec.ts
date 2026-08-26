import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `useApi` e singurul loc prin care trec toate cererile către backend, iar logica lui de refresh
 * are două subtilități care merită teste: reîncearcă exact o dată pe 401, și de-duplică
 * refresh-urile concurente printr-un `refreshPromise` partajat. Fără de-duplicare, zece cereri
 * paralele care primesc 401 ar declanșa zece refresh-uri, iar ultimele nouă ar folosi un refresh
 * token deja rotit.
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

/** Eroare cu aceeași formă ca cea aruncată de `$fetch` din ofetch. */
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
  it("atașează tokenul de acces ca Bearer", async () => {
    const seen: Record<string, unknown>[] = [];
    handler = (_url, opts) => {
      seen.push(opts);
      return Promise.resolve({ ok: true });
    };

    const api = await loadUseApi();
    await api("/invoices");

    expect((seen[0].headers as Record<string, string>).Authorization).toBe("Bearer acces-vechi");
  });

  it("nu atașează niciun header când nu există token", async () => {
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

  it("pe 401 face refresh și reîncearcă o singură dată, cu tokenul nou", async () => {
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

  it("nu face refresh pentru alte coduri decât 401", async () => {
    const calls: string[] = [];
    handler = (url) => {
      calls.push(url);
      return Promise.reject(httpError(500));
    };

    const api = await loadUseApi();
    await expect(api("/invoices")).rejects.toThrow();

    expect(calls).toEqual(["/invoices"]);
  });

  it("de-duplică refresh-urile concurente: zece cereri, un singur refresh", async () => {
    const calls: string[] = [];
    const failedOnce = new Set<string>();
    let releaseRefresh: (v: unknown) => void = () => {};
    const refreshGate = new Promise((resolve) => {
      releaseRefresh = resolve;
    });

    handler = async (url) => {
      calls.push(url);
      if (url === "/auth/refresh") {
        await refreshGate; // ține refresh-ul deschis cât timp sosesc celelalte 401-uri
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

    // Lasă cele zece cereri să eșueze cu 401 și să ceară refresh, apoi deblochează refresh-ul.
    await new Promise((resolve) => setTimeout(resolve, 10));
    releaseRefresh(null);
    await Promise.all(pending);

    expect(calls.filter((c) => c === "/auth/refresh")).toHaveLength(1);
    expect(calls.filter((c) => c !== "/auth/refresh")).toHaveLength(20); // 10 eșuate + 10 reîncercate
  });

  it("șterge tokenurile când refresh-ul însuși eșuează", async () => {
    handler = (url) => {
      if (url === "/auth/refresh") return Promise.reject(httpError(401));
      return Promise.reject(httpError(401));
    };

    const api = await loadUseApi();
    await expect(api("/invoices")).rejects.toThrow();

    expect(tokenStore.clearTokens).toHaveBeenCalled();
  });

  it("permite un refresh nou după ce cel anterior s-a încheiat", async () => {
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

    // `refreshPromise` se golește în `finally`, deci a doua rundă are voie să reîmprospăteze.
    expect(calls.filter((c) => c === "/auth/refresh")).toHaveLength(2);
  });
});
