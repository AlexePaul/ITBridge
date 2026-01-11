import { useProfileApi } from "./api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";

export const ProfileSetup = ref(false);

export const useProfileInitialization = () => {
  const profileApi = useProfileApi();
  const profileStore = useProfileStore();
  const userStore = useUserStore();

  const initializeProfile = async () => {
    try {
      if (!userStore.user) {
        console.log("[Profile Init] No user found, skipping profile fetch");
        return;
      }

      console.log("[Profile Init] Fetching profile...");
      await profileApi.fetchProfile();

      if (!profileStore.profile) {
        console.log("[Profile Init] No profile, setting ProfileSetup flag");
        ProfileSetup.value = true;
      } else {
        console.log("[Profile Init] Profile loaded successfully");
        ProfileSetup.value = false;
      }
    } catch (error) {
      console.error("[Profile Init] Failed:", error);
      // Still set ProfileSetup flag so user can complete profile
      ProfileSetup.value = true;
    }
  };

  return {
    initializeProfile,
  };
};
