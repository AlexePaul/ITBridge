import type { Profile } from "~/types/profile.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useProfileStore } from "~/stores/profileStore";
import { ProfileSetup } from "../useProfileInitialization";

export const useProfileApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const profileStore = useProfileStore();

  const fetchProfile = async (id: string | null = null) => {
    try {
      const data = await api<Profile[]>("/profiles", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
        query: {
          profileId: id,
        },
      });
      console.log("Fetched profile data:", data);
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
      ProfileSetup.value = false;
      return createdProfile;
    } catch (err: any) {
      return err.data?.statusCode || 500;
    }
  };

  const deleteProfile = async (profileId: string) => {
    try {
      await api<void>(`/profiles/${profileId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });
      profileStore.clearProfile();
    } catch (err: any) {
      const errorMessage = err.message || "Failed to delete profile";
      console.error(errorMessage);
      throw err;
    }
  };

  const updateProfile = async (profileData: Partial<Profile>, profileId: number) => {
    try {
      const updatedProfile = await api<Profile>(`/profiles/${profileId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
        body: profileData,
      });
      profileStore.setProfile(updatedProfile);
      return updatedProfile;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to update profile";
      console.error(errorMessage);
      throw err;
    }
  };

  return {
    fetchProfile,
    getProfile,
    createProfile,
    deleteProfile,
    updateProfile,
  };
};
