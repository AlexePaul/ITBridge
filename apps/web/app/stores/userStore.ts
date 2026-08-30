// stores/userStore.ts
import { defineStore } from "pinia";
import { useApi } from "~/composables/api/useApi";
import { useTokenStore } from "./tokenStore";
import type { CurrentUser } from "~/types/user.types";
import { ref, readonly } from "vue";

export const useUserStore = defineStore("user", () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  // `CurrentUser`, not `User`: `/auth/me` also carries the state of the two account gates from
  // E11/S2, and every screen in the portal has to know — a pending account is shown a waiting
  // notice instead of an empty dashboard that reads as a bug.
  const user = ref<CurrentUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchUser = async () => {
    loading.value = true;
    error.value = null;

    try {
      const response = await api<CurrentUser>("/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });

      user.value = response;
      console.log("Fetched user data:", response);
      return response;
    } catch (err: any) {
      error.value = err.message || "Failed to fetch user";
      user.value = null;
      throw err;
    } finally {
      loading.value = false;
    }
  };

  const logout = () => {
    user.value = null;
    error.value = null;
  };

  return {
    user: readonly(user),
    loading: readonly(loading),
    error: readonly(error),
    fetchUser,
    logout,
  };
});
