import type { Profile } from "~/types/profile.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useProfileStore } from "~/stores/profileStore";
import { ProfileSetup } from "../useProfileInitialization";
import type { PendingAccount, RejectedAccount, SuspendedAccount, User } from "~/types/user.types";

export const useUserApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const fetchUsersWithoutProfile = async () => {
    const response = await api<User[]>("/users/without-profile", {
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });
    return response;
  };

  /** Parent accounts waiting for a verdict — E11/S2, the second gate. Admin only. */
  const fetchPendingAccounts = async () => {
    return api<PendingAccount[]>("/users/pending", {
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });
  };

  /**
   * Parent accounts the school refused, newest decision first — where the office looks again from,
   * as the refusal mail promises. Admin only.
   */
  const fetchRejectedAccounts = async () => api<RejectedAccount[]>("/users/rejected");

  const approveAccount = async (userId: number) => {
    return api<{ message: string }>(`/users/${userId}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });
  };

  /**
   * `reason` is a note for the next admin who reads the row, never sent to the parent — so it can
   * be shorthand, and the form says so.
   */
  const rejectAccount = async (userId: number, reason?: string) => {
    return api<{ message: string }>(`/users/${userId}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      body: { reason: reason ?? "" },
    });
  };

  /** Terms §14: the suspended parent accounts, most recent first. Admin only. */
  const fetchSuspendedAccounts = async () => api<SuspendedAccount[]>("/users/suspended");

  /**
   * Terms §14. Unlike a refusal's note, `reason` is sent: the family is mailed it with the
   * suspension, so the form asks for a sentence the family can read.
   */
  const suspendAccount = async (userId: number, reason: string) =>
    api<{ message: string }>(`/users/${userId}/suspend`, { method: "POST", body: { reason } });

  const reactivateAccount = async (userId: number) =>
    api<{ message: string }>(`/users/${userId}/reactivate`, { method: "POST" });

  return {
    fetchUsersWithoutProfile,
    fetchPendingAccounts,
    fetchRejectedAccounts,
    fetchSuspendedAccounts,
    approveAccount,
    rejectAccount,
    suspendAccount,
    reactivateAccount,
  };
};
