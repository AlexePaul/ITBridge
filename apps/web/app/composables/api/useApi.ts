import { useTokenStore } from "~/stores/tokenStore";

/**
 * Shared across every composable, not per `useApi()` call.
 *
 * It used to be a closure variable, so `useChildrenApi()` and `useInvoiceApi()` on one page each
 * held their own promise. When the access token expired both refreshed with the same token, and
 * since the backend rotates refresh tokens the loser looked like a replay — which revokes the whole
 * session family and logs the parent out. One module-level promise is what actually de-duplicates.
 */
let refreshPromise: Promise<void> | null = null;

export const useApi = () => {
  const config = useRuntimeConfig();
  const tokenStore = useTokenStore();

  const client = $fetch.create({
    baseURL: config.public.apiBase as string,
    credentials: "include",
  });

  async function doRefresh() {
    try {
      const res = await client("/auth/refresh", {
        method: "POST",
        body: { refreshToken: tokenStore.refreshToken },
      });
      if (res && typeof res === "object" && "accessToken" in (res as any)) {
        tokenStore.setAccessToken((res as any).accessToken as string);
      }
      // The refresh token rotates: the one we just sent is now consumed server-side, and the
      // response carries its successor. Storing only the access token left the old token in the
      // cookie, so the *next* refresh replayed a consumed token — the backend read that as theft,
      // revoked the family and logged the user out, roughly half an hour into every session.
      if (res && typeof res === "object" && "refreshToken" in (res as any)) {
        tokenStore.setRefreshToken((res as any).refreshToken as string);
      }
    } catch (err) {
      tokenStore.clearTokens();
      throw err;
    }
  }

  async function ensureRefreshed() {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  }

  const api = async <T = any>(url: string, opts: any = {}): Promise<T> => {
    const buildHeaders = () => {
      const headers = Object.assign({}, opts.headers || {});
      const token = tokenStore.accessToken as unknown as string | null;
      if (token) headers.Authorization = `Bearer ${token}`;
      return headers;
    };

    try {
      // The generic is the caller's contract; $fetch widens it to
      // TypedInternalResponse once the app has server routes of its own.
      return (await client<T>(url, { ...opts, headers: buildHeaders() })) as T;
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      if (status === 401) {
        try {
          await ensureRefreshed();
          return (await client<T>(url, { ...opts, headers: buildHeaders() })) as T;
        } catch (refreshErr) {
          tokenStore.clearTokens();
          throw refreshErr;
        }
      }
      throw err;
    }
  };

  return api;
};
