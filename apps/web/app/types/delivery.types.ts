export type {
  DeliveryRecord,
  DeliveryStatus,
  DeliverySummary,
  DeliveryLogFilter,
  DeliveryFailureReason,
} from "@itbridge/types";

import type { DeliveryFailureReason, DeliveryStatus } from "@itbridge/types";

/** Romanian labels for the delivery record — E17/S5. Next to the screen, per the standing rule. */
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "În așteptare",
  sent: "Trimis",
  failed: "Eșuat",
  undeliverable: "Nelivrabil",
};

export const DELIVERY_STATUS_COLORS: Record<
  DeliveryStatus,
  "info" | "success" | "error" | "warning"
> = {
  pending: "info",
  sent: "success",
  failed: "error",
  undeliverable: "warning",
};

/**
 * The two reasons, and — the point of keeping them apart — what to do about each. They look
 * identical in a list; one needs a phone call, the other a resent link.
 */
export const UNDELIVERABLE_REASON_LABELS: Record<DeliveryFailureReason, string> = {
  no_address: "Fără adresă",
  unconfirmed_address: "Adresă neconfirmată",
};

export const UNDELIVERABLE_REASON_ACTIONS: Record<DeliveryFailureReason, string> = {
  no_address: "Sună familia și completează adresa în profil.",
  unconfirmed_address: "Retrimite linkul de confirmare din contul părintelui.",
};
