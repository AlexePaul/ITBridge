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
    try {
      return await api<Blob>(`/invoices/${invoiceId}/pdf`, {
        method: "GET",
        headers: { Accept: "application/pdf" },
        // ofetch decides how to parse from the content type; a PDF has to be asked for explicitly or
        // it comes back as a mangled string.
        responseType: "blob",
      });
    } catch (err: unknown) {
      await readErrorBody(err);
      throw err;
    }
  };

  /**
   * An error's JSON body, read back from the `Blob` the requested `responseType` turned it into.
   *
   * ofetch parses every response as asked, error or not, so the code and the sentence the server
   * wrote for this route — a free month with nothing to print, a fiscal PDF not issued yet — sat
   * unread inside a Blob, and `apiErrorMessage` found nothing and fell back to "Nu s-a putut încărca
   * factura" for all of them (end-to-end testing, 25 September 2026).
   */
  const readErrorBody = async (err: unknown): Promise<void> => {
    const holder = err as { data?: unknown } | null;
    if (!holder || !(holder.data instanceof Blob)) return;
    try {
      holder.data = JSON.parse(await holder.data.text());
    } catch {
      // Not JSON after all: the caller's fallback is the honest answer.
    }
  };

  return {
    fetchInvoicePdf,
  };
}
