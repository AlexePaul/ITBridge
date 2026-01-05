import { useProfileInitialization, ProfileSetup } from "~/composables/useProfileInitialization";

export { ProfileSetup };

export default defineNuxtPlugin(async (nuxtApp) => {
  const { initializeProfile } = useProfileInitialization();
  await initializeProfile();
});
