import type {
  Payment,
  CreatePaymentDto,
  UpdatePaymentDto,
  FilterPaymentDto,
} from "~/types/payment.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { usePaymentsStore } from "~/stores/paymentsStore";

export const usePaymentsApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();
  const paymentsStore = usePaymentsStore();

  const fetchPayments = async (filter?: FilterPaymentDto) => {
    const queryParams = new URLSearchParams();
    if (filter?.invoiceId) queryParams.append("invoiceId", filter.invoiceId.toString());
    if (filter?.dateFrom) queryParams.append("dateFrom", filter.dateFrom);
    if (filter?.dateTo) queryParams.append("dateTo", filter.dateTo);

    const url = `/payments${queryParams.toString() ? `?${queryParams.toString()}` : ""}`;

    const fetchedPayments = await api<Payment[]>(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });

    paymentsStore.setPayments(fetchedPayments);
    return fetchedPayments;
  };

  const getPaymentById = async (id: number) => {
    try {
      const payment = await api<Payment>(`/payments/${id}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });
      return payment;
    } catch (error) {
      console.error("Error fetching payment:", error);
      throw error;
    }
  };

  const createPayment = async (dto: CreatePaymentDto) => {
    try {
      const payment = await api<Payment>("/payments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dto),
      });
      return payment;
    } catch (error) {
      console.error("Error creating payment:", error);
      throw error;
    }
  };

  const updatePayment = async (id: number, dto: UpdatePaymentDto) => {
    try {
      const payment = await api<Payment>(`/payments/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dto),
      });
      return payment;
    } catch (error) {
      console.error("Error updating payment:", error);
      throw error;
    }
  };

  const deletePayment = async (id: number) => {
    try {
      await api<void>(`/payments/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });
    } catch (error) {
      console.error("Error deleting payment:", error);
      throw error;
    }
  };

  return {
    fetchPayments,
    getPaymentById,
    createPayment,
    updatePayment,
    deletePayment,
  };
};
