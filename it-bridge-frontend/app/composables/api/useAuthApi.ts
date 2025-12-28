import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import type { LoginResponse } from "~/types/auth.types";

export const useAuthApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const login = async (username: string, password: string) => {
    const response = await api<LoginResponse>("/auth/login", {
      method: "POST",
      body: { username, password },
    });

    // Store tokens in the Pinia store
    if (response && response.accessToken) {
      tokenStore.setAccessToken(response.accessToken);
      tokenStore.setRefreshToken(response.refreshToken || "");
    }

    useUserStore().fetchUser();

    return response;
  };

  const register = async (data: any) => {
    return await api<LoginResponse>("/auth/register", {
      method: "POST",
      body: data,
    });
  };

  return { login, register };
};
