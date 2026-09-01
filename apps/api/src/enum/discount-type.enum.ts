/**
 * How a discount's `value` is read — E15/S5.
 *
 * Two values, because the school gives exactly two kinds: a sum off (a goodwill adjustment, a
 * rounding) and a share off (the referral, which is 50%). The column is what decides whether a
 * stored `50` means fifty lei or fifty per cent — the number alone cannot say, which is precisely
 * why the type had to be a column rather than a convention.
 */
export enum DiscountType {
    /** `value` is lei off the total. */
    FIXED = 'fixed',
    /** `value` is a percentage of the **list price** — see `discountTotal` in `pricing.ts`. */
    PERCENT = 'percent',
}
