import type { Profile } from "~/types/profile.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useProfileStore } from "~/stores/profileStore";
import { ProfileSetup } from "../useProfileInitialization";
import type { User } from "~/types/user.types";

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

  return {
    fetchUsersWithoutProfile,
  };
};
