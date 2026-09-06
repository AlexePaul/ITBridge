import { useProfileApi } from "./api/useProfileApi";
import { useProfileStore } from "~/stores/profileStore";
import { useUserStore } from "~/stores/userStore";

/**
 * Whether the parent still owes the school step two of registration — E11/S2, revised.
 *
 * The test used to be "this account has no `Profile` row at all", which was right while `register`
 * wrote only credentials. It stopped being right the moment `register` began writing a shell
 * profile in the same transaction: the row always exists now, so the flag would never rise and the
 * second step would open for nobody.
 *
 * The answer comes from `/auth/me` as a boolean the server derived (`isProfileComplete`). It is
 * deliberately not recomputed here from the profile's fields: the screen that redirects and the
 * endpoint that refuses to place a child have to agree about the same family, and two copies of a
 * rule are two answers waiting to diverge.
 */
export const ProfileSetup = ref(false);

export const useProfileInitialization = () => {
  const profileApi = useProfileApi();
  const profileStore = useProfileStore();
  const userStore = useUserStore();

  const initializeProfile = async () => {
    if (!userStore.user) return;

    // The profile itself is still fetched, because the setup form needs the fields it already has
    // — a family the admin entered by phone arrives with a name and sometimes an address.
    try {
      await profileApi.fetchProfile();
    } catch {
      // The flag below does not depend on this call. A profile that could not be loaded leaves the
      // form empty, which is recoverable; guessing "incomplete" from a failed fetch would trap a
      // parent whose profile is fine on a page they cannot leave.
    }

    ProfileSetup.value = userStore.user.profileComplete === false;
    if (!profileStore.profile && ProfileSetup.value) {
      // No row at all is the older shape — an account created outside `register`. Same destination.
      ProfileSetup.value = true;
    }
  };

  return { initializeProfile };
};
