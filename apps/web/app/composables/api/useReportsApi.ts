import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { FinanceReport, OccupancyReport } from "~/types/reports.types";

/** The two reports — E21/S2 and S4. Admin only, read only. */
export const useReportsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  /** Invoiced against collected, month by month, both ends of the range included. */
  const fetchFinanceReport = async (from: string, to: string) =>
    api<FinanceReport>(`/reports/finance?${new URLSearchParams({ from, to })}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  /** Seats against capacity, by group, room and address. */
  const fetchOccupancyReport = async () =>
    api<OccupancyReport>("/reports/occupancy", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });

  return { fetchFinanceReport, fetchOccupancyReport };
};
