import type { Invoice } from "~/types/invoice.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";

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

  const generateInvoices = async () => {
    try {
      const response = await api<any>("/invoices/generate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenStore.accessToken}`,
        },
      });
      console.log("Invoices generated response:", response);
      return response;
    } catch (err: any) {
      console.error("Error generating invoices:", err);
      throw err;
    }
  };
  return {
    getInvoices,
    fetchInvoices,
    generateInvoices,
  };
};
