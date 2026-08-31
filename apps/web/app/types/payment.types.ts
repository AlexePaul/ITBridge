export type {
  Payment,
  PaymentMethod,
  PaymentStatus,
  CreatePaymentDto,
  UpdatePaymentDto,
  FilterPaymentDto,
} from "@itbridge/types";

import type { PaymentMethod, PaymentStatus } from "@itbridge/types";

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
