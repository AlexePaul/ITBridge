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

/**
 * What one session costs, for the first child in a family.
 *
 * The unit is the **session**, not the month. That is how the school has always actually charged —
 * hours held in the month, times the rate — and the flat monthly figure was a description of a
 * four-session month, not a price. Keeping the month as the unit meant a February with two classes
 * cost the same as a March with five, which nobody intended and the school corrected by hand every
 * month with a calculator.
 *
 * 350 / 4 = 87.50, so the number families already know is unchanged: a normal month still comes to
 * 350 lei. Only the short months are now right.
 */
export const FIRST_CHILD_PER_SESSION = 87.5;

/** What one session costs for every child after the first. 250 / 4, the same discount as before. */
export const SIBLING_PER_SESSION = 62.5;

/** What a full four-session month comes to. Kept for the public site, which quotes a monthly figure. */
export const FIRST_CHILD_MONTHLY = FIRST_CHILD_PER_SESSION * 4;

/** The same, for a sibling. */
export const SIBLING_MONTHLY = SIBLING_PER_SESSION * 4;

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
 * What a family owes for one month, from the sessions each of their children attended.
 *
 * One entry per child, in whatever order. **The full rate goes to the child with the most
 * sessions**, the sibling rate to the rest — so a family with children in groups of different
 * lengths is charged the same way whichever order the screen happens to list them in. Sorting is
 * the whole of the rule; without it, the amount would depend on the order of rows in a query.
 *
 * A child with zero sessions costs nothing and does not consume the full rate — a family whose only
 * attending child is the second one still pays the first-child rate for them, which is what anybody
 * would expect and what the alternative gets wrong.
 *
 * Fractions are real here: three sessions at 62.50 is 187.50, and the total is rounded to the bani
 * rather than left to float arithmetic, so 4 × 87.5 is 350 and not 350.00000000000006.
 */
export function amountForSessions(sessionsPerChild: number[]): number {
    const attending = sessionsPerChild.filter((sessions) => sessions > 0).sort((a, b) => b - a);

    const total = attending.reduce((sum, sessions, index) => sum + sessions * (index === 0 ? FIRST_CHILD_PER_SESSION : SIBLING_PER_SESSION), 0);

    return roundToBani(total);
}

/** Two decimals, without the floating-point tail. Money on an invoice has to add up on paper. */
export function roundToBani(value: number): number {
    return Math.round(value * 100) / 100;
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

/** The session-based amount with the month's discounts taken off, floored at zero for the same reason. */
export function sessionAmountAfterDiscounts(sessionsPerChild: number[], discountValues: number[]): number {
    const total = discountValues.reduce((left, value) => left - value, amountForSessions(sessionsPerChild));
    return roundToBani(Math.max(0, total));
}
