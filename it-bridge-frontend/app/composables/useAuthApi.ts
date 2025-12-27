import { useUserStore } from "./useUserStore";

// composables/useAuthApi.ts
interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export const useAuthApi = () => {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase;

  const login = async (username: string, password: string) => {
    const response = await $fetch<LoginResponse>(`${apiBase}/auth/login`, {
      method: "POST",
      body: { username, password },
    });

    // Store tokens in cookies
    if (response && response.accessToken) {
      const accessTokenCookie = useCookie("accessToken");
      const refreshTokenCookie = useCookie("refreshToken");

      accessTokenCookie.value = response.accessToken;
      refreshTokenCookie.value = response.refreshToken || null;
    }

    return response;
  };

  const register = async (data: any) => {
    return await $fetch(`${apiBase}/auth/register`, {
      method: "POST",
      body: data,
    });
  };

  return { login, register };
};
