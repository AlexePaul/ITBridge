export type { ArrearsRow, ArrearsBucket } from "@itbridge/types";

import type { ArrearsBucket } from "@itbridge/types";

/** Romanian labels for the ageing bands — E16/S7. Next to the screen, per the standing rule. */
export const ARREARS_BUCKET_LABELS: Record<ArrearsBucket, string> = {
  due_soon: "Se apropie termenul",
  overdue: "Depășit",
  over_30: "Peste 30 de zile",
  over_60: "Peste 60 de zile",
};

/**
 * Colour by band, not by severity of feeling. `over_60` is neutral rather than red on purpose: the
 * platform has stopped writing at that point and the row is a prompt to phone somebody, which is a
 * calmer act than the colour red suggests.
 */
export const ARREARS_BUCKET_COLORS: Record<
  ArrearsBucket,
  "info" | "warning" | "error" | "neutral"
> = {
  due_soon: "info",
  overdue: "warning",
  over_30: "error",
  over_60: "neutral",
};
