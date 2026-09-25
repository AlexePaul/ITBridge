export type {
  FiscalQueueStatus,
  Invoice,
  InvoiceFiscalStatus,
  InvoiceStatus,
  SmartBillMode,
  InvoiceWorksheet,
  InvoiceWorksheetLine,
  InvoiceWorksheetRow,
  InvoiceWorksheetUnmarked,
  IssueInvoicesResult,
  SessionCountOverrideDto,
} from "@itbridge/types";

import type { Invoice, InvoiceFiscalStatus, SmartBillMode } from "@itbridge/types";

/**
 * What a family still has to pay on an invoice: the server's `outstanding`, from the same sum as
 * the arrears screen — never `amount`. The portal showed a family that had paid 100 of 350 the
 * whole 350, and a family that pays what the screen says pays twice. The fallback covers a
 * response without the field; the invoice list and the single invoice always carry it.
 */
export const leftToPay = (invoice: Pick<Invoice, "amount" | "outstanding">): number =>
  invoice.outstanding ?? invoice.amount;

/**
 * How the office reads an invoice's state with SmartBill — E16/S2. Labels live here, beside the
 * screens, not in the contract: on the wire the value is `'review'`, not „De verificat".
 */
export const FISCAL_STATUS_LABELS: Record<InvoiceFiscalStatus, string> = {
  pending: "În coadă",
  uncertain: "Se trimite",
  review: "De verificat",
  draft: "Ciornă",
  issued: "Emisă",
  failed: "Refuzată",
};

export const FISCAL_STATUS_COLORS: Record<
  InvoiceFiscalStatus,
  "neutral" | "info" | "warning" | "success" | "error"
> = {
  pending: "neutral",
  uncertain: "info",
  review: "warning",
  draft: "info",
  issued: "success",
  failed: "error",
};

export const SMARTBILL_MODE_LABELS: Record<SmartBillMode, string> = {
  off: "oprit — facturile se emit doar în platformă, nimic nu pleacă în SmartBill",
  draft:
    "ciorne — fiecare factură ajunge în SmartBill ca ciornă, fără număr și fără valoare fiscală",
  live: "facturi fiscale — fiecare factură se emite în SmartBill, cu serie și număr",
};
