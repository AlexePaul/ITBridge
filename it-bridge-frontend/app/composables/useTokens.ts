// composables/useTokens.ts
export const useTokens = () => {
  const accessToken = useCookie("accessToken");
  const refreshToken = useCookie("refreshToken");

  const getAccessToken = () => accessToken.value;
  const getRefreshToken = () => refreshToken.value;

  const clearTokens = () => {
    accessToken.value = null;
    refreshToken.value = null;
  };

  const setAccessToken = (token: string) => {
    accessToken.value = token;
  };

  const setRefreshToken = (token: string) => {
    refreshToken.value = token;
  };

  return {
    accessToken: readonly(accessToken),
    refreshToken: readonly(refreshToken),
    getAccessToken,
    getRefreshToken,
    setAccessToken,
    setRefreshToken,
    clearTokens,
  };
};
