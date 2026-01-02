import { defineStore } from "pinia";
import { ref, readonly } from "vue";
import type { Profile } from "~/types/profile.types";

export const useProfileStore = defineStore("profile", () => {
  const profile = ref<Profile | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const setProfile = (data: Profile) => {
    profile.value = data;
  };

  const clearProfile = () => {
    profile.value = null;
    error.value = null;
  };

  const setLoading = (value: boolean) => {
    loading.value = value;
  };

  const setError = (message: string | null) => {
    error.value = message;
  };

  return {
    profile: readonly(profile),
    loading: readonly(loading),
    error: readonly(error),
    setProfile,
    clearProfile,
    setLoading,
    setError,
  };
});
