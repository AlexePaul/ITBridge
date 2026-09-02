import {
    addMonths,
    billingMonthOf,
    deadSlotsOf,
    defaultFinanceRange,
    distinctSlots,
    fillRate,
    firstDayOf,
    lastDayOf,
    lostRevenueMonthly,
    monthsBetween,
    slotsOverlap,
    LOST_REVENUE_PER_SEAT_MONTHLY,
} from './reports.rules';

/**
 * The calendar and threshold rules under the reports — E21/S2 and S4.
 *
 * Month arithmetic is where a report is quietly wrong by one: a range that stops a month early, a
 * February that gets thirty days, a January whose "previous month" is month zero. Each of those is a
 * line below.
 */
describe('billing month arithmetic', () => {
    it('reads the month off a date or a date key', () => {
        expect(billingMonthOf('2026-03-14')).toBe('2026-03');
        expect(billingMonthOf(new Date(2026, 0, 31))).toBe('2026-01');
    });

    it('steps across a year boundary in both directions', () => {
        expect(addMonths('2026-01', -1)).toBe('2025-12');
        expect(addMonths('2025-12', 1)).toBe('2026-01');
        expect(addMonths('2026-03', 12)).toBe('2027-03');
    });

    it('lists every month in a range, both ends included', () => {
        expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
        expect(monthsBetween('2026-05', '2026-05')).toEqual(['2026-05']);
    });

    it('returns no months when the range is backwards, rather than looping', () => {
        expect(monthsBetween('2026-05', '2026-04')).toEqual([]);
    });

    it('knows the last day of every kind of month', () => {
        expect(firstDayOf('2026-02')).toBe('2026-02-01');
        expect(lastDayOf('2026-02')).toBe('2026-02-28');
        expect(lastDayOf('2028-02')).toBe('2028-02-29');
        expect(lastDayOf('2026-12')).toBe('2026-12-31');
        expect(lastDayOf('2026-04')).toBe('2026-04-30');
    });

    it('defaults to the last twelve months, the current one included', () => {
        expect(defaultFinanceRange(new Date(2026, 8, 2))).toEqual({ from: '2025-10', to: '2026-09' });
    });
});

describe('seats', () => {
    it('fills to two decimals and treats no capacity as nothing filled', () => {
        expect(fillRate(4, 10)).toBe(0.4);
        expect(fillRate(1, 3)).toBe(0.33);
        expect(fillRate(0, 0)).toBe(0);
    });

    it('prices an empty seat at the first-child monthly list price', () => {
        expect(lostRevenueMonthly(6)).toBe(6 * LOST_REVENUE_PER_SEAT_MONTHLY);
        expect(lostRevenueMonthly(6)).toBe(2100);
        expect(lostRevenueMonthly(0)).toBe(0);
        // A group over capacity by exception (E11/S3) has no seats to sell.
        expect(lostRevenueMonthly(-1)).toBe(0);
    });
});

describe('dead hours', () => {
    const monday16 = { weekday: 1, startTime: '16:00:00', endTime: '17:30:00' };
    const monday17 = { weekday: 1, startTime: '17:00:00', endTime: '18:00:00' };
    const monday18 = { weekday: 1, startTime: '18:00:00', endTime: '19:30:00' };
    const tuesday16 = { weekday: 2, startTime: '16:00:00', endTime: '17:30:00' };

    it('overlaps only on the same weekday and only when the minutes cross', () => {
        expect(slotsOverlap(monday16, monday17)).toBe(true);
        expect(slotsOverlap(monday16, monday18)).toBe(false);
        expect(slotsOverlap(monday16, tuesday16)).toBe(false);
    });

    it('collapses two groups at the same hour into one slot, in week order', () => {
        expect(distinctSlots([tuesday16, monday16, { ...monday16 }])).toEqual([monday16, tuesday16]);
    });

    it('calls an hour dead only when some other room teaches in it', () => {
        const school = [monday16, tuesday16, monday18];
        // A room busy Monday 17:00–18:00 covers the 16:00 slot by overlap, but not 18:00 (it ends as that
        // one starts) or Tuesday.
        expect(deadSlotsOf([monday17], school)).toEqual([monday18, tuesday16]);
        // The busiest room has no dead hours; an unused room is dead in every hour the school uses.
        expect(deadSlotsOf(school, school)).toEqual([]);
        expect(deadSlotsOf([], school)).toEqual([monday16, monday18, tuesday16]);
    });
});
