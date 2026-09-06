import { teachingMonthOf, teachingMonthRange } from './billing-period.rules';

/**
 * The month rule of E15/S9: a week belongs to the month its Monday falls in, whole.
 *
 * The dates below are real. In 2026, 31 August is a Monday, so the week 31 Aug – 6 Sep is an August
 * week and four of its seven days are in September. That is the case the rule exists for.
 */
describe('teachingMonthOf', () => {
    it('a week that opens in August is August, including its September days', () => {
        // Monday 31 August 2026 opens the week; Friday is 4 September.
        expect(teachingMonthOf('2026-08-31')).toBe('2026-08');
        expect(teachingMonthOf('2026-09-04')).toBe('2026-08');
        expect(teachingMonthOf('2026-09-06')).toBe('2026-08');
    });

    it('the next week is September, and the boundary is exactly the Monday', () => {
        expect(teachingMonthOf('2026-09-07')).toBe('2026-09');
    });

    it('the first days of a month belong to the month before when the week opened there', () => {
        // 1 September 2026 is a Tuesday, inside the week that opened on 31 August.
        expect(teachingMonthOf('2026-09-01')).toBe('2026-08');
    });

    it('a week wholly inside a month is that month, which is the ordinary case', () => {
        expect(teachingMonthOf('2026-09-09')).toBe('2026-09');
    });

    it('carries a year boundary with the week', () => {
        // Monday 28 December 2026 opens a week running into 3 January 2027.
        expect(teachingMonthOf('2026-12-28')).toBe('2026-12');
        expect(teachingMonthOf('2027-01-01')).toBe('2026-12');
        expect(teachingMonthOf('2027-01-03')).toBe('2026-12');
        expect(teachingMonthOf('2027-01-04')).toBe('2027-01');
    });

    it('accepts a Date as well as the string the driver hands back', () => {
        expect(teachingMonthOf(new Date(2026, 8, 4))).toBe('2026-08');
    });
});

describe('teachingMonthRange', () => {
    it('starts on the first Monday that belongs to the month', () => {
        // August 2026 opens on a Saturday, whose week is a July week — so August starts on the 3rd.
        expect(teachingMonthRange('2026-08').from).toBe('2026-08-03');
    });

    it('runs to the Sunday closing the week of the last Monday', () => {
        // The last Monday of August 2026 is the 31st; its week ends on 6 September.
        expect(teachingMonthRange('2026-08').to).toBe('2026-09-06');
    });

    it('starts on the 1st when the month itself opens on a Monday', () => {
        // 1 June 2026 is a Monday.
        expect(teachingMonthRange('2026-06').from).toBe('2026-06-01');
    });

    it('leaves no gap and no overlap between consecutive months', () => {
        // Every week is claimed by exactly one Monday, so the day after one month ends is the day
        // the next one starts. This is the property the whole rule is for.
        const august = teachingMonthRange('2026-08');
        const september = teachingMonthRange('2026-09');
        expect(august.to).toBe('2026-09-06');
        expect(september.from).toBe('2026-09-07');
    });

    it('agrees with teachingMonthOf at both of its ends', () => {
        const { from, to } = teachingMonthRange('2026-08');
        expect(teachingMonthOf(from)).toBe('2026-08');
        expect(teachingMonthOf(to)).toBe('2026-08');
    });

    it('crosses a year boundary', () => {
        // December 2026's last Monday is the 28th, so the month runs into January.
        expect(teachingMonthRange('2026-12').to).toBe('2027-01-03');
        expect(teachingMonthRange('2027-01').from).toBe('2027-01-04');
    });

    it('handles February, including a leap year', () => {
        expect(teachingMonthOf(teachingMonthRange('2028-02').to)).toBe('2028-02');
        expect(teachingMonthOf(teachingMonthRange('2026-02').to)).toBe('2026-02');
    });
});
