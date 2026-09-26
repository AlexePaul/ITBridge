import { describe, expect, it, vi } from "vitest";
import { apiErrorMessage } from "~/composables/useApiError";

/**
 * The invoice PDF asks for a Blob, so an error's JSON arrives as one too. ofetch's `FetchError`
 * exposes `data` through a getter: the page used to assign the parsed body back onto it, the
 * assignment threw inside its own catch, and every refusal read "Nu s-a putut încărca factura" —
 * a free month's own sentence included (QA of 26 September 2026).
 */
class GetterOnlyFetchError extends Error {
  readonly status = 404;
  readonly statusCode = 404;
  constructor(private readonly body: Blob) {
    super("[GET] /invoices/7/pdf: 404 Not Found");
  }
  get data(): Blob {
    return this.body;
  }
}

const refusal = new GetterOnlyFetchError(
  new Blob(
    [JSON.stringify({ code: "INVOICE_WAIVED_HAS_NO_PDF", message: "Invoice 7 is waived" })],
    {
      type: "application/json",
    }
  )
);

vi.mock("~/composables/api/useApi", () => ({
  useApi: () => () => Promise.reject(refusal),
}));

describe("an invoice PDF the server refuses", () => {
  it("shows the server's own sentence, read out of the Blob", async () => {
    const { usePDFApi } = await import("~/composables/api/usePDFApi");

    const caught = await usePDFApi()
      .fetchInvoicePdf(7)
      .then(
        () => null,
        (err: unknown) => err
      );

    expect(apiErrorMessage(caught, "Nu s-a putut încărca factura.")).not.toBe(
      "Nu s-a putut încărca factura."
    );
    expect(apiErrorMessage(caught)).toMatch(/fără plată|0 lei|nu are PDF|gratuit/i);
  });
});
