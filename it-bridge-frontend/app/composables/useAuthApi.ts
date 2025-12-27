// composables/useAuthApi.ts
export const useAuthApi = () => {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase;

  const login = async (username: string, password: string) => {
    return await $fetch(`${apiBase}/auth/login`, {
      method: "POST",
      body: { username, password },
    });
  };

  const register = async (data: any) => {
    return await $fetch(`${apiBase}/auth/register`, {
      method: "POST",
      body: data,
    });
  };

  return { login, register };
};
