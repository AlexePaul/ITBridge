import type { Profile } from "~/types/profile.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useProfileStore } from "~/stores/profileStore";

export const useProfileApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const profileStore = useProfileStore();

  const fetchProfile = async () => {
    try {
      const data = await api<Profile[]>("/profiles", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });

      profileStore.setProfile(data[0] as Profile);
      return data;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to fetch profile";
      console.error(errorMessage);
      throw err;
    }
  };

  const getProfile = () => {
    return profileStore.profile;
  };

  const createProfile = async (profileData: Partial<Profile>) => {
    try {
      const createdProfile = await api<Profile>("/profiles", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
        body: profileData,
      });

      profileStore.setProfile(createdProfile);
      return createdProfile;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to create profile";
      console.error(errorMessage);
      throw err;
    }
  };

  return {
    fetchProfile,
    getProfile,
    createProfile,
  };
};
