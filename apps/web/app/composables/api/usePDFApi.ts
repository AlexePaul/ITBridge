import { useApi } from "./useApi";

export function usePDFApi() {
  const api = useApi();

  /**
   * Downloads an invoice PDF.
   *
   * Goes through `useApi` like every other call. It used to use a bare `fetch` with the access
   * token pasted into a header, which meant it was the one request in the app with no refresh on
   * 401 — a parent whose token had expired (fifteen minutes) got nothing at all, because the error
   * was then swallowed into `null` with only a `console.error` to show for it.
   */
  const fetchInvoicePdf = async (invoiceId: number): Promise<Blob> => {
    return api<Blob>(`/invoices/${invoiceId}/pdf`, {
      method: "GET",
      headers: { Accept: "application/pdf" },
      // ofetch decides how to parse from the content type; a PDF has to be asked for explicitly or
      // it comes back as a mangled string.
      responseType: "blob",
    });
  };

  return {
    fetchInvoicePdf,
  };
}
