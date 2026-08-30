import type { Profile } from "~/types/profile.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useProfileStore } from "~/stores/profileStore";
import { ProfileSetup } from "../useProfileInitialization";
import type { PendingAccount, User } from "~/types/user.types";

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

  return {
    fetchUsersWithoutProfile,
    fetchPendingAccounts,
    approveAccount,
    rejectAccount,
  };
};
