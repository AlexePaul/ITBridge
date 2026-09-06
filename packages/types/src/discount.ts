import type { BillingMonth } from './common';

/**
 * How a discount's `value` is read — E15/S5. Mirrors `DiscountType` in
 * `apps/api/src/enum/discount-type.enum.ts`.
 *
 * A union of literals, not an enum: this package is CommonJS and ships no runtime values. The
 * Romanian labels live next to the screens, in `apps/web/app/types/discount.types.ts`.
 */
export type DiscountType = 'fixed' | 'percent';

export interface Discount {
    id: number;
    name: string;
    description?: string | null;
    /**
     * Lei off, or per cent off, according to `type`. The number alone cannot say which — a `50` is
     * fifty lei or half the invoice — which is exactly why the type is stored beside it.
     */
    value: number;
    type: DiscountType;
    monthIssued: BillingMonth;
    /** Present only when the query joins the family. */
    parent?: { id: number; firstName: string; lastName: string };
}

export interface CreateDiscountDto {
    parentId: number;
    name: string;
    value: number;
    /** Defaults to `fixed` on the server. A percentage above 100 is refused. */
    type?: DiscountType;
    monthIssued: BillingMonth;
    description?: string;
}

export interface UpdateDiscountDto {
    name?: string;
    value?: number;
    type?: DiscountType;
    monthIssued?: BillingMonth;
    description?: string;
}

/**
 * The one-press referral reward — E20/S5: half off next month, for one family.
 *
 * One field, because everything else is fixed by the decision: 50%, „Recomandare", and the month
 * after the current one on the school's clock. The server picks the month; a client that computed
 * it would be the second place that knows what „next month" means, and the two would disagree for
 * about two hours every first of the month.
 */
export interface GrantReferralDiscountDto {
    parentId: number;
}
