import { useProfileApi } from "~/composables/api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";
import { authInitialized } from "./01.auth.client";

export const ProfileSetup: Ref<boolean> = ref(false);

export default defineNuxtPlugin(async (nuxtApp) => {
  const profileStore = useProfileStore();
  const profileApi = useProfileApi();

  if (!authInitialized.value) {
    return;
  }
  if (!profileStore.profile) {
    await profileApi.fetchProfile();
  }

  if (!profileStore.profile) {
    ProfileSetup.value = true;
  }
});
