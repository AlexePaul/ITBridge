export type {
  Discount,
  DiscountType,
  CreateDiscountDto,
  UpdateDiscountDto,
  GrantReferralDiscountDto,
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
