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
      throw await withReadableBody(err);
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
  const withReadableBody = async (err: unknown): Promise<unknown> => {
    const holder = err as { data?: unknown; status?: number; statusCode?: number } | null;
    if (!holder || !(holder.data instanceof Blob)) return err;
    try {
      const data: unknown = JSON.parse(await holder.data.text());
      // A new object, not `holder.data = …`: ofetch's `FetchError` exposes `data` through a getter,
      // so the assignment threw — inside this very catch — and the sentence was read and dropped
      // (QA of 26 September 2026). `apiErrorMessage` reads `data`; the status travels along.
      return { data, status: holder.status, statusCode: holder.statusCode };
    } catch {
      // Not JSON after all: the caller's fallback is the honest answer.
      return err;
    }
  };

  return {
    fetchInvoicePdf,
  };
}
