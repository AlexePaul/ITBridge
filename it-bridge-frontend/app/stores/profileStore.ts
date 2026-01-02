import { defineStore } from "pinia";
import { ref, readonly } from "vue";
import type { Profile } from "~/types/profile.types";

export const useProfileStore = defineStore("profile", () => {
  const profile = ref<Profile | null>(null);

  const setProfile = (data: Profile) => {
    profile.value = data;
  };

  const clearProfile = () => {
    profile.value = null;
  };

  return {
    profile: readonly(profile),
    setProfile,
    clearProfile,
  };
});
