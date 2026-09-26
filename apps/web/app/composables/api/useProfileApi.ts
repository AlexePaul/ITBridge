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
      // Rethrow. This used to `return err.data?.statusCode || 500`, so a 400 arrived at the caller
      // as the number 400 and profile-setup.vue navigated away as if the profile had been created —
      // while the setup flag stayed set, so the middleware bounced the parent straight back to an
      // empty form, with no message. An unfinishable loop that looked like nothing at all.
      console.error("Failed to create profile:", err);
      throw err;
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
      // A PUT answers with the row, not its relations. Stored whole, it dropped the children the
      // page had loaded, and /user/profile then told the family it had none — and hid the consent
      // controls with them — after one tick of the marketing box (end-to-end testing, 25 September
      // 2026). What the answer carries replaces; what it does not carry, stays.
      const current = profileStore.profile;
      profileStore.setProfile(
        current && current.id === updatedProfile.id
          ? ({ ...current, ...updatedProfile } as Profile)
          : updatedProfile
      );
      return updatedProfile;
    } catch (err: any) {
      const errorMessage = err.message || "Failed to update profile";
      console.error(errorMessage);
      throw err;
    }
  };

  /** Every family, for a picker — without touching the store `fetchProfile` fills. ADMIN. */
  const fetchFamilies = async (): Promise<Profile[]> =>
    api<Profile[]>("/profiles", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return {
    fetchFamilies,
    fetchProfile,
    getProfile,
    createProfile,
    deleteProfile,
    updateProfile,
  };
};
