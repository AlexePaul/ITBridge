import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import type { DeliveryLogFilter, DeliveryRecord, DeliverySummary } from "~/types/delivery.types";

/** The delivery record — E17/S5. Admin only; every row carries a family's address and message. */
export const useDeliveriesApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const auth = () => ({ Authorization: `Bearer ${tokenStore.accessToken}` });

  /**
   * Undefined filters are stripped rather than sent: `?status=undefined` reaches the API as the
   * string "undefined", and implicit conversion is off there, so it is a 400 rather than "no
   * filter" — the same trap `useClassSessionsApi` records.
   */
  const fetchDeliveries = async (filter: DeliveryLogFilter = {}) => {
    const query = Object.fromEntries(
      Object.entries(filter).filter(([, value]) => value !== undefined && value !== "")
    );
    return api<DeliveryRecord[]>("/deliveries", { method: "GET", headers: auth(), query });
  };

  const fetchDeliverySummary = async () =>
    api<DeliverySummary>("/deliveries/summary", { method: "GET", headers: auth() });

  return { fetchDeliveries, fetchDeliverySummary };
};
