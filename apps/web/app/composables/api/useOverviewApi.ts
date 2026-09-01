import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { Overview } from "~/types/overview.types";

/** „Cum stăm?", într-o cerere — E21/S1. Admin only. */
export const useOverviewApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const fetchOverview = async () =>
    api<Overview>("/overview", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return { fetchOverview };
};
