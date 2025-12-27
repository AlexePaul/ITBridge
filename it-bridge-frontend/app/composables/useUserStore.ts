import { useTokens } from "./useTokens";

// composables/useUserStore.ts
interface User {
  id: string;
  username: string;
  email: string;
  role: "ADMIN" | "PARENT";
}

const user = ref<User | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

export const useUserStore = () => {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase;

  const fetchUser = async () => {
    loading.value = true;
    error.value = null;

    try {
      const { accessToken } = useTokens();
      const response = await $fetch<User>(`${apiBase}/auth/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken.value}`,
        },
      });

      user.value = response;
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
};
