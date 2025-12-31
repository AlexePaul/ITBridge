import type { Invoice } from "~/types/invoice.types";
import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";

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
    console.log("Fetched invoices:", invoices.value);
  };

  const getInvoices = () => {
    return invoices.value;
  };
  return {
    getInvoices,
    fetchInvoices,
  };
};
