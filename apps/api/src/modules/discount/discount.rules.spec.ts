import { monthAfter, nextBillingMonth, nextBillingMonthAt, nextUncoveredMonth, REFERRAL_PERCENT } from './discount.rules';

/**
 * What "next month" means, and why it is computed from text — E20/S5.
 *
 * The interesting cases are the two ends of December and the hour when the school and UTC disagree
 * about the date. Both produce an invoice against the wrong month, and neither shows up in a
 * review: the reward would simply be applied to a month that has already been billed.
 */
describe('nextBillingMonth', () => {
    it('moves to the following month', () => {
        expect(nextBillingMonth('2026-03-09')).toBe('2026-04');
        expect(nextBillingMonth('2026-01-01')).toBe('2026-02');
    });

    it('rolls the year over from December', () => {
        expect(nextBillingMonth('2026-12-01')).toBe('2027-01');
        expect(nextBillingMonth('2026-12-31')).toBe('2027-01');
    });

    it('does not care which day of the month it is', () => {
        expect(nextBillingMonth('2026-05-01')).toBe('2026-06');
        expect(nextBillingMonth('2026-05-31')).toBe('2026-06');
    });

    it('refuses anything that is not a day key, rather than guessing', () => {
        expect(() => nextBillingMonth('2026-05')).toThrow();
        expect(() => nextBillingMonth('')).toThrow();
    });
});

describe('nextBillingMonthAt', () => {
    it('reads the month on the school clock, not in UTC', () => {
        // 31 December, 23:00 UTC is already 1 January in Bucharest, so the reward belongs to
        // February. Through UTC it would land on January — the month about to be invoiced.
        expect(nextBillingMonthAt(new Date('2026-12-31T23:00:00Z'))).toBe('2027-02');
    });

    it('agrees with the plain rule for an hour with no disagreement in it', () => {
        expect(nextBillingMonthAt(new Date('2026-03-09T12:00:00Z'))).toBe('2026-04');
    });
});

describe('REFERRAL_PERCENT', () => {
    it('is half, which is both sides of E20/S5s rule', () => {
        expect(REFERRAL_PERCENT).toBe(50);
    });
});

describe('monthAfter', () => {
    it('steps one month', () => {
        expect(monthAfter('2026-04')).toBe('2026-05');
        expect(monthAfter('2026-01')).toBe('2026-02');
    });

    it('rolls the year over from December', () => {
        expect(monthAfter('2026-12')).toBe('2027-01');
    });

    it('refuses a day key or a month that does not exist', () => {
        expect(() => monthAfter('2026-04-01')).toThrow();
        expect(() => monthAfter('2026-13')).toThrow();
        expect(() => monthAfter('2026-00')).toThrow();
    });
});

/**
 * Where the next press lands — E20/S5.
 *
 * A second press means a second month, so the walk starts at the first month the reward does not
 * already cover. It fills a gap before extending the run: a month somebody removed by hand is the
 * cheapest one to give back.
 */
describe('nextUncoveredMonth', () => {
    it('lands on the start when nothing is covered', () => {
        expect(nextUncoveredMonth('2026-04', [])).toBe('2026-04');
    });

    it('walks past a run that is already covered', () => {
        expect(nextUncoveredMonth('2026-04', ['2026-04', '2026-05'])).toBe('2026-06');
    });

    it('fills a gap in the middle before extending the run', () => {
        expect(nextUncoveredMonth('2026-04', ['2026-04', '2026-06'])).toBe('2026-05');
    });

    it('walks across the end of the year', () => {
        expect(nextUncoveredMonth('2026-12', ['2026-12'])).toBe('2027-01');
    });
});
