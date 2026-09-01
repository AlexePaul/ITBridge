import { amountAfterDiscounts, amountForSessions, discountTotal, FIRST_CHILD_PER_SESSION, sessionAmountAfterDiscounts, SIBLING_PER_SESSION } from './pricing';
import { DiscountType } from 'src/enum/discount-type.enum';

/**
 * The rule the school actually charges by: sessions held, times the rate.
 *
 * The monthly figure everybody quotes — 350 lei — is a description of a four-session month, not a
 * price. These tests are about the cases where the two stop agreeing, which is every short month.
 */
describe('amountForSessions', () => {
    it('charges the first child per session, so a normal month is still 350', () => {
        expect(amountForSessions([4])).toBe(350);
    });

    it('charges a short month short, which is the whole point', () => {
        // June with two classes was invoiced at 175 by hand. That is now the rule, not a correction.
        expect(amountForSessions([2])).toBe(175);
        expect(amountForSessions([3])).toBe(262.5);
        expect(amountForSessions([5])).toBe(437.5);
    });

    it('gives the sibling rate to every child after the first', () => {
        expect(amountForSessions([4, 4])).toBe(600);
        expect(amountForSessions([4, 4, 4])).toBe(850);
    });

    it('puts the full rate on the child with the most sessions, whatever order they arrive in', () => {
        // Otherwise the amount would depend on the order of rows in a query, which is not a thing a
        // family's invoice may depend on.
        expect(amountForSessions([3, 5])).toBe(amountForSessions([5, 3]));
        expect(amountForSessions([3, 5])).toBe(5 * FIRST_CHILD_PER_SESSION + 3 * SIBLING_PER_SESSION);
    });

    it('does not let a child with no sessions consume the full rate', () => {
        // A family whose only attending child happens to be listed second still pays the
        // first-child rate for them. The alternative charges a discount nobody earned and a full
        // rate to nobody.
        expect(amountForSessions([0, 4])).toBe(350);
        expect(amountForSessions([4, 0])).toBe(350);
    });

    it('comes to nothing when nobody attended', () => {
        expect(amountForSessions([])).toBe(0);
        expect(amountForSessions([0])).toBe(0);
        expect(amountForSessions([0, 0])).toBe(0);
    });

    it('returns money, not floating-point sludge', () => {
        // 4 × 87.5 is 350, not 350.00000000000006. This goes on a document.
        expect(amountForSessions([4, 3])).toBe(537.5);
        expect(Number.isInteger(amountForSessions([4, 4]) * 100)).toBe(true);
    });
});

/** Shorthands, so the tests below read as money rather than as object literals. */
const lei = (value: number) => ({ type: DiscountType.FIXED, value });
const percent = (value: number) => ({ type: DiscountType.PERCENT, value });

describe('sessionAmountAfterDiscounts', () => {
    it("takes the month's discounts off the top", () => {
        expect(sessionAmountAfterDiscounts([4], [lei(50), lei(25)])).toBe(275);
    });

    it('never goes negative, however large the discount', () => {
        // A discount bigger than the invoice is a typo, not a credit note. Nothing downstream
        // expects a negative invoice and the school has never meant to issue one.
        expect(sessionAmountAfterDiscounts([4], [lei(5000)])).toBe(0);
    });

    it('leaves a month with no sessions at zero rather than below it', () => {
        expect(sessionAmountAfterDiscounts([0], [lei(100)])).toBe(0);
    });

    describe('the referral, which is what the percentage type exists for', () => {
        it('halves a full month for one child: 350 becomes 175', () => {
            expect(sessionAmountAfterDiscounts([4], [percent(50)])).toBe(175);
        });

        it('halves the family total, not one child rate — two children, 600 becomes 300', () => {
            expect(sessionAmountAfterDiscounts([4, 4], [percent(50)])).toBe(300);
        });

        it('follows a short month down: three sessions is 262.50, halved 131.25', () => {
            // The point of the percentage: it tracks whatever the month actually came to.
            expect(sessionAmountAfterDiscounts([3], [percent(50)])).toBe(131.25);
        });
    });

    describe('mixing the two kinds', () => {
        it('the percentage is of the list price, so order cannot change the invoice', () => {
            // 350 − 50% − 50 lei = 125, whichever order they arrive in.
            expect(sessionAmountAfterDiscounts([4], [percent(50), lei(50)])).toBe(125);
            expect(sessionAmountAfterDiscounts([4], [lei(50), percent(50)])).toBe(125);
        });

        it('two halves take the invoice to zero, not to a quarter', () => {
            // Compounding would give 87.50 and quietly make each discount worth less than its
            // name says. This is the reading anybody expects from "half off, and half off again".
            expect(sessionAmountAfterDiscounts([4], [percent(50), percent(50)])).toBe(0);
        });

        it('rounds the discount itself, so the printed lines add up', () => {
            // 25% of 262.50 is 65.625, which no invoice can hold. The discount is rounded first —
            // to 65.63 — and the total follows from it, so 262.50 − 65.63 = 196.87 is an
            // arithmetic a parent can check on paper. Rounding only the total would print a
            // 65.63 line beside a 196.88 total, and those two do not add up.
            expect(discountTotal(262.5, [percent(25)])).toBe(65.63);
            expect(sessionAmountAfterDiscounts([3], [percent(25)])).toBe(196.87);
        });
    });
});

describe('discountTotal', () => {
    it('a percentage of nothing is nothing — a waived month stays waived', () => {
        expect(discountTotal(0, [percent(50)])).toBe(0);
    });

    it('adds the two kinds together', () => {
        expect(discountTotal(400, [percent(25), lei(30)])).toBe(130);
    });
});

describe('amountAfterDiscounts', () => {
    it('applies a percentage to the monthly list price too', () => {
        expect(amountAfterDiscounts(2, [percent(50)])).toBe(300);
    });
});
