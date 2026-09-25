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

import type { InvoiceFiscalStatus, SmartBillMode } from "@itbridge/types";

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
