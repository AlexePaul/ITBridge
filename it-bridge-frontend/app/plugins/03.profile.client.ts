import { useProfileApi } from "~/composables/api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";

export const ProfileSetup: Ref<boolean> = ref(false);

export default defineNuxtPlugin(async (nuxtApp) => {
  const profileStore = useProfileStore();
  const profileApi = useProfileApi();
  const userStore = useUserStore();

  if (userStore.user) {
    await profileApi.fetchProfile();
  }

  if (!profileStore.profile) ProfileSetup.value = true;
  else ProfileSetup.value = false;
});
