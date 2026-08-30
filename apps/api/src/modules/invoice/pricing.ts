/**
 * The monthly price of a family, in one place.
 *
 * The rule agreed with the school: **350 lei for the first child, 250 for every sibling after.**
 * So 350 / 600 / 850 / 1100, and so on. The public site says the same — `PRICE_ONE_CHILD` and
 * `PRICE_TWO_CHILDREN` in `apps/web/shared/courses.ts` are 350 and 600 — which is how the
 * discrepancy below was worth catching: the site advertised 600 for two children while the
 * platform invoiced 500.
 *
 * This lived inline in `InvoiceService.calculateAmount` and, separately, in the seed. Both had the
 * same two defects, because a rule written twice is a rule that disagrees with itself:
 *
 *  - **two children were charged 500**, as `250 × 2`, which drops the first child's higher rate and
 *    undercharges every two-child family by 100 lei a month;
 *  - **three or more children had no branch at all**, so the total stayed 0 and any discount then
 *    took it negative. Two `it.failing` tests documented that; they are regression tests now.
 *
 * Module pricing — 700 per module, −25% from the second child — is a different model and belongs to
 * E15. This file is the monthly model, which is the one actually in force.
 */

/** What the first child in a family costs, per month. */
export const FIRST_CHILD_MONTHLY = 350;

/** What each additional child costs, per month. */
export const SIBLING_MONTHLY = 250;

/**
 * The list price for a family of `childCount` children, before discounts.
 *
 * Returns 0 for a family with no children rather than throwing: whether that is an error is the
 * caller's question, and `InvoiceService` already answers it with a 404 before getting here.
 */
export function monthlyAmountFor(childCount: number): number {
    if (childCount <= 0) return 0;
    return FIRST_CHILD_MONTHLY + SIBLING_MONTHLY * (childCount - 1);
}

/**
 * The list price with discounts applied, floored at zero.
 *
 * The floor is not cosmetic. Discounts are entered by hand, so a typo — or several discounts on one
 * month — could otherwise produce a negative invoice, which is a credit note the school never meant
 * to issue and which no downstream code expects. A discount larger than the invoice is capped and
 * the surplus is simply lost, because carrying it forward would be a decision nobody has made.
 */
export function amountAfterDiscounts(childCount: number, discountValues: number[]): number {
    const total = discountValues.reduce((left, value) => left - value, monthlyAmountFor(childCount));
    return Math.max(0, total);
}
