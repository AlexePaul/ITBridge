import type { Invoice } from "~/types/invoice.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { date } from "zod";

export const overdueInvoices = ref<boolean>(false);

export const pendingInvoices = ref<boolean>(false);

export const useInvoiceApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const invoices = ref<Invoice[]>([]);

  const fetchInvoices = async () => {
    const fetchedInvoices = await api<Invoice[]>("/invoices", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenStore.accessToken}`,
      },
    });

    invoices.value = fetchedInvoices;
    for (const invoice of invoices.value) {
      if (invoice.status === "overdue") {
        overdueInvoices.value = true;
      }
      if (invoice.status === "pending") {
        pendingInvoices.value = true;
      }
    }
  };

  const getInvoices = () => {
    return invoices.value;
  };

  const previewInvoices = async (parentIds: number[], monthIssued: string) => {
    try {
      const response = await api<Array<{ parentId: number; amount: number }>>(`/invoices/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ parentIds, monthIssued }),
      });
      return response || [];
    } catch (error) {
      console.error("Error previewing invoices:", error);
      return [];
    }
  };

  const generateInvoices = async (parentIds: number[], monthIssued: string) => {
    try {
      await api<void>(`/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parentIds: parentIds,
          monthIssued: monthIssued,
          dateIssued: new Date().toISOString().split("T")[0],
        }),
      });
    } catch (error) {
      console.error("Error generating invoices:", error);
      throw error;
    }
  };

  return {
    getInvoices,
    fetchInvoices,
    previewInvoices,
    generateInvoices,
  };
};
