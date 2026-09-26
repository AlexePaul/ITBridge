export type {
  Discount,
  DiscountType,
  CreateDiscountDto,
  UpdateDiscountDto,
  GrantReferralDiscountDto,
  ReferralReward,
  FamilyDiscount,
} from "@itbridge/types";

import type { DiscountType } from "@itbridge/types";

/**
 * Romanian labels for the two discount kinds — E15/S5.
 *
 * Here rather than in `@itbridge/types`, per the standing rule: the contract package is CommonJS
 * and ships no runtime values. The wire carries `'percent'`; `'Procent'` is a screen's business.
 */
export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  fixed: "Sumă fixă",
  percent: "Procent",
};

/** How a value reads once you know its type: `50` → `"50 lei"` or `"50%"`. */
export function formatDiscountValue(value: number, type: DiscountType): string {
  return type === "percent" ? `${value}%` : `${value} lei`;
}

/**
 * A discount as the family reads it in the portal: `−50%` or `−100 lei`. Commas, because the reader
 * is Romanian — `formatDiscountValue` above is the office's shorter form.
 */
export function familyDiscountValue(value: number, type: DiscountType): string {
  if (type === "percent") return `−${String(value).replace(".", ",")}%`;
  return `−${Number.isInteger(value) ? String(value) : value.toFixed(2).replace(".", ",")} lei`;
}
