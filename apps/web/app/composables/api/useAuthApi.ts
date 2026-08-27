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

  const register = async (username: string, password: string) => {
    const response = await api<LoginResponse>("/auth/register", {
      method: "POST",
      body: { username, password },
    });

    if (response && response.accessToken) {
      tokenStore.setAccessToken(response.accessToken);
      tokenStore.setRefreshToken(response.refreshToken || "");
    }

    useUserStore().fetchUser();

    return response;
  };

  /**
   * Real logout: tells the server to revoke the refresh token, rather than only forgetting it here.
   *
   * Without this call E05/S7 was delivered on the backend and unused — the sessions row stayed
   * live and the token kept working for its full seven days after the user pressed "log out".
   * Deliberately best-effort: the local session must be cleared even if the request fails, and
   * revoking an unknown token is a no-op server-side, so there is nothing to report to the user.
   */
  const logout = async () => {
    const refreshToken = tokenStore.refreshToken;
    if (!refreshToken) return;
    try {
      await api<{ message: string }>("/auth/logout", {
        method: "POST",
        body: { refreshToken },
      });
    } catch (err) {
      console.error("Logout request failed; clearing the local session anyway:", err);
    }
  };

  return { login, register, logout };
};
