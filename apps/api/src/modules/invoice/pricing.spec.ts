import { amountForSessions, FIRST_CHILD_PER_SESSION, sessionAmountAfterDiscounts, SIBLING_PER_SESSION } from './pricing';

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

describe('sessionAmountAfterDiscounts', () => {
    it("takes the month's discounts off the top", () => {
        expect(sessionAmountAfterDiscounts([4], [50, 25])).toBe(275);
    });

    it('never goes negative, however large the discount', () => {
        // A discount bigger than the invoice is a typo, not a credit note. Nothing downstream
        // expects a negative invoice and the school has never meant to issue one.
        expect(sessionAmountAfterDiscounts([4], [5000])).toBe(0);
    });

    it('leaves a month with no sessions at zero rather than below it', () => {
        expect(sessionAmountAfterDiscounts([0], [100])).toBe(0);
    });
});
