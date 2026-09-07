import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { EarlySignals, FinanceReport, OccupancyReport } from "~/types/reports.types";

/** The reports — E21/S2, S4 and S7. Admin only, read only. */
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

  /**
   * The early signals — E21/S7. `asOf` is the retrospective check: a past day evaluates the marks
   * and the invoices as they stood then. Stripped when absent, for the reason `fetchSessions`
   * records — an undefined in a query string reaches the API as the string "undefined".
   */
  const fetchSignals = async (asOf?: string) =>
    api<EarlySignals>("/reports/signals", {
      method: "GET",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
      query: asOf ? { asOf } : undefined,
    });

  return { fetchFinanceReport, fetchOccupancyReport, fetchSignals };
};
