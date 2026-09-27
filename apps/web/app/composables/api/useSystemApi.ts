import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { SystemStatus } from "~/types/system.types";

/** `/admin/sistem`: the backend's configuration, read where it runs. The office's alone. */
export const useSystemApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const fetchSystemStatus = async () =>
    api<SystemStatus>("/system/status", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return { fetchSystemStatus };
};
