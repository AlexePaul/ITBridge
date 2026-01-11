// stores/tokenStore.ts
import { defineStore } from "pinia";

export const useTokenStore = defineStore("tokens", () => {
  const accessToken = useCookie("accessToken");
  const refreshToken = useCookie("refreshToken");

  const setAccessToken = (token: string) => {
    accessToken.value = token;
  };

  const setRefreshToken = (token: string) => {
    refreshToken.value = token;
  };

  const clearTokens = () => {
    accessToken.value = null;
    refreshToken.value = null;
  };

  return {
    accessToken: readonly(accessToken),
    refreshToken: readonly(refreshToken),
    setAccessToken,
    setRefreshToken,
    clearTokens,
  };
});
