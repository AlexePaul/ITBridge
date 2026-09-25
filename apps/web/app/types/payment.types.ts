export type {
  Payment,
  PaymentMethod,
  PaymentStatus,
  PaymentFiscalStatus,
  PaymentFiscalQueueStatus,
  ConfirmPaymentRecordDto,
  CreatePaymentDto,
  UpdatePaymentDto,
  FilterPaymentDto,
} from "@itbridge/types";

import type { PaymentFiscalStatus, PaymentMethod, PaymentStatus } from "@itbridge/types";

/**
 * Romanian labels for the two payment enums — E16/S1.
 *
 * Defined here, not in `@itbridge/types`, per the standing rule: the contract package is CommonJS,
 * ships no runtime values, and the wire carries `'cash'`, not `'Numerar'`.
 */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Numerar",
  bank_transfer: "Transfer bancar",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  initiated: "Anunțată",
  succeeded: "Încasată",
  failed: "Eșuată",
  reversed: "Stornată",
};

/** Badge colors keyed the same way, so a screen never invents its own mapping. */
export const PAYMENT_STATUS_COLORS: Record<
  PaymentStatus,
  "success" | "warning" | "error" | "neutral"
> = {
  initiated: "warning",
  succeeded: "success",
  failed: "error",
  reversed: "neutral",
};

/**
 * Where a payment stands with SmartBill — E16/S5. "Înregistrată" rather than "emisă": only a cash
 * payment becomes a document (a receipt); a transfer is recorded on the invoice without one.
 */
export const PAYMENT_FISCAL_STATUS_LABELS: Record<PaymentFiscalStatus, string> = {
  pending: "În coadă",
  uncertain: "Se trimite",
  review: "De verificat",
  recorded: "Înregistrată",
  failed: "Refuzată",
};

export const PAYMENT_FISCAL_STATUS_COLORS: Record<
  PaymentFiscalStatus,
  "success" | "warning" | "error" | "neutral" | "info"
> = {
  pending: "neutral",
  uncertain: "info",
  review: "warning",
  recorded: "success",
  failed: "error",
};

/** A collection exists in SmartBill, or may: the row is reversed here, never deleted. */
export const PAYMENT_RECORD_MAY_EXIST: readonly PaymentFiscalStatus[] = [
  "uncertain",
  "review",
  "recorded",
];
