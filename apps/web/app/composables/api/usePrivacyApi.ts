import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";

/**
 * The rights a family exercises over its own data — E07/S4.
 *
 * Through `useApi`, like everything else: a raw `fetch` would skip the refresh on 401, and the
 * portal is exactly where an access token is routinely older than fifteen minutes. That is not
 * hypothetical — it is the bug the project archive had, and `no-raw-api-fetch.spec.ts` now fails on
 * it.
 *
 * There is no id in the path. The profile comes from the token, so a family can ask for its own
 * record and for nothing else — the strongest form of the row-level rule, applied where the payload
 * is everything the school holds.
 */
export const usePrivacyApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const fetchOwnExport = async (): Promise<unknown> =>
    api<unknown>("/privacy/export", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return { fetchOwnExport };
};
