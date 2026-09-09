import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { ProfileSummary } from "~/types/profile.types";

/** A family waiting, as the office queue lists it. */
export type ErasurePending = ProfileSummary;

/** What an erasure removed and what it kept — shown back to whoever pressed the button. */
export interface ErasureReport {
  profileId: number;
  childrenRemoved: number;
  leadsRemoved: number;
  discountsRemoved: number;
  messagesRemoved: number;
  invoicesKept: number;
  accountRemoved: boolean;
}

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

  /** Records the request and starts the clock. Deletes nothing — the office carries it out. */
  const requestErasure = async (): Promise<{ requestedAt: string }> =>
    api<{ requestedAt: string }>("/privacy/erasure", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  const withdrawErasure = async (): Promise<void> =>
    api<void>("/privacy/erasure", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** The office queue, oldest request first. ADMIN. */
  const fetchPendingErasures = async (): Promise<ErasurePending[]> =>
    api<ErasurePending[]>("/privacy/erasure/pending", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** Carries it out. ADMIN, and it cannot be undone. */
  const eraseProfile = async (profileId: number): Promise<ErasureReport> =>
    api<ErasureReport>(`/privacy/erasure/${profileId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return { fetchOwnExport, requestErasure, withdrawErasure, fetchPendingErasures, eraseProfile };
};
