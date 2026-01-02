import type { Profile } from "~/types/profile.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useProfileStore } from "~/stores/profileStore";

export const useProfileApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const profileStore = useProfileStore();

  const fetchProfile = async () => {
    profileStore.setLoading(true);
    profileStore.setError(null);

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
      profileStore.setError(errorMessage);
      throw err;
    } finally {
      profileStore.setLoading(false);
    }
  };

  const createProfile;

  const getProfile = () => {
    return profileStore.profile;
  };

  return {
    fetchProfile,
    getProfile,
  };
};
