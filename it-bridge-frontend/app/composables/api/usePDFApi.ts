import { useTokenStore } from "~/stores/tokenStore";

export function usePDFApi() {
  const config = useRuntimeConfig();
  const baseURL = config.public.apiBase || "http://localhost:3000";
  const tokenStore = useTokenStore();

  const fetchInvoicePdf = async (invoiceId: number): Promise<Blob | null> => {
    try {
      const token = tokenStore.accessToken;
      const response = await fetch(`${baseURL}/invoices/${invoiceId}/pdf`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/pdf",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }

      return await response.blob();
    } catch (error) {
      console.error("Error fetching PDF:", error);
      return null;
    }
  };

  return {
    fetchInvoicePdf,
  };
}
