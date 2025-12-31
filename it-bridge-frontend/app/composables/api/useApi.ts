import { useTokenStore } from "~/stores/tokenStore";

export const useApi = () => {
  const config = useRuntimeConfig();
  const tokenStore = useTokenStore();

  const client = $fetch.create({
    baseURL: config.public.apiBase as string,
    credentials: "include",
  });

  // Prevent multiple simultaneous refresh requests
  let refreshPromise: Promise<void> | null = null;

  async function doRefresh() {
    try {
      const res = await client("/auth/refresh", {
        method: "POST",
        body: { refreshToken: tokenStore.refreshToken },
      });
      if (res && typeof res === "object" && "accessToken" in (res as any)) {
        tokenStore.setAccessToken((res as any).accessToken as string);
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
      return await client<T>(url, { ...opts, headers: buildHeaders() });
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      if (status === 401) {
        try {
          await ensureRefreshed();
          return await client<T>(url, { ...opts, headers: buildHeaders() });
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
