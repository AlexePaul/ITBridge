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

/**
 * Whether `/auth/refresh` itself turned the refresh token down — the one answer that ends a session.
 *
 * It used to be any failure at all. A refresh lost on one bar of signal, or a 502 while the API
 * restarted, cleared both tokens, and the teacher on the phone register was signed out for the
 * network's sake — with every mark tapped after that answered 401 and, until the screen learned to
 * tell the two apart, thrown away as "refused". A 400 (a malformed token) or a 401 (expired,
 * revoked, replayed) is the server saying the token is no good; anything else says nothing about
 * the token, and the next request that meets a 401 simply refreshes again.
 */
export const refreshRejected = (err: unknown): boolean => {
  const failure = err as { status?: number; response?: { status?: number } } | null;
  const status = failure?.status ?? failure?.response?.status;
  return status === 400 || status === 401;
};

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
      if (refreshRejected(err)) tokenStore.clearTokens();
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
      // Only with something to refresh with. A visitor with no session at all used to be sent
      // through `/auth/refresh` with `refreshToken: null`, and the 400 that came back — the
      // validator's own English, „refreshToken should not be empty" — replaced the 401 the screen
      // could have explained, on the page a parent reaches from the school's email (`/files/…`).
      if (status === 401 && tokenStore.refreshToken) {
        try {
          await ensureRefreshed();
        } catch (refreshErr) {
          // Turned down: the request is still what it was, unauthorized, and its 401 is what a
          // screen can explain — not the refresh's own 400. Not delivered: the refresh's error goes
          // back as it is, network-shaped, and the session stays for the next attempt.
          throw refreshRejected(refreshErr) ? err : refreshErr;
        }
        // Outside the `try` on purpose: the retried request's own failure — a 409, a 500 — is that
        // request's answer, and it used to sign the user out as well.
        return (await client<T>(url, { ...opts, headers: buildHeaders() })) as T;
      }
      throw err;
    }
  };

  return api;
};
