import { isInReplacementWeek, replacementWeekFor } from './replacement.rules';

/**
 * The window of E12/S4, which is **the week the class was missed in** and nothing else.
 *
 * 7 September 2026 is a Monday, so that week runs to Sunday the 13th. Every case below is about one
 * of two things: that the window is a week rather than a count of days, and that it is built from
 * local calendar components — the trap `class-session.dates.ts` exists for.
 */
describe('replacementWeekFor', () => {
    it('runs Monday to Sunday around the missed class', () => {
        // Wednesday the 9th.
        expect(replacementWeekFor(new Date(2026, 8, 9))).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    });

    it('gives every class of one week the same two bounds', () => {
        // A Monday absence does not buy six days more than a Saturday one: the window belongs to
        // the week, not to the class.
        expect(replacementWeekFor('2026-09-07')).toEqual(replacementWeekFor('2026-09-12'));
    });

    it('counts Sunday into the week that opened six days earlier', () => {
        // ISO weeks end on Sunday. Reading it as the start of the next one would hand that family
        // seven days nobody granted.
        expect(replacementWeekFor('2026-09-13')).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    });

    it('accepts the string the driver hands back for a date column', () => {
        expect(replacementWeekFor('2026-09-09')).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    });

    it('crosses a month boundary with the week, not with the calendar', () => {
        // Wednesday 30 September 2026 sits in the week that closes on Sunday 4 October.
        expect(replacementWeekFor('2026-09-30')).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    });

    it('crosses a year boundary the same way', () => {
        // Thursday 31 December 2026 is in the week closing Sunday 3 January 2027.
        expect(replacementWeekFor('2026-12-31')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
    });

    it('lands on real days across the autumn clock change', () => {
        // Romania puts the clocks back on the last Sunday of October — 25 October in 2026, which is
        // itself the end of its week. Bounds built by adding milliseconds would answer the 24th at
        // 23:00 here, and a child told Sunday would be placed into a class the platform thinks is in
        // the wrong week. The date helpers walk local components, so they are not.
        expect(replacementWeekFor('2026-10-20')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    });
});

describe('isInReplacementWeek', () => {
    // The class that was missed: Wednesday the 9th.
    const missed = { date: new Date(2026, 8, 9) };

    it('accepts a later class in the same week', () => {
        expect(isInReplacementWeek(missed, { date: new Date(2026, 8, 12) })).toBe(true);
    });

    it('accepts an earlier one — the week is the unit, not "after"', () => {
        // Being moved to Tuesday for a Wednesday you already knew you would miss is the ordinary
        // case, not an edge one: the office plans on Monday, before any of it has happened.
        expect(isInReplacementWeek(missed, { date: new Date(2026, 8, 8) })).toBe(true);
    });

    it('accepts the Monday that opens the week and the Sunday that closes it', () => {
        expect(isInReplacementWeek(missed, { date: new Date(2026, 8, 7) })).toBe(true);
        expect(isInReplacementWeek(missed, { date: new Date(2026, 8, 13) })).toBe(true);
    });

    it('refuses the Monday after — one day out, and out is out', () => {
        expect(isInReplacementWeek(missed, { date: new Date(2026, 8, 14) })).toBe(false);
    });

    it('refuses the Sunday before, for the same reason on the other side', () => {
        expect(isInReplacementWeek(missed, { date: new Date(2026, 8, 6) })).toBe(false);
    });

    it('refuses what the thirty-day credit used to allow', () => {
        // Three weeks later was a perfectly good booking under the old model. It is the case this
        // rule exists to stop.
        expect(isInReplacementWeek(missed, { date: new Date(2026, 8, 30) })).toBe(false);
    });

    it('accepts the strings the driver hands back for both sides', () => {
        expect(isInReplacementWeek({ date: '2026-09-09' as unknown as Date }, { date: '2026-09-12' as unknown as Date })).toBe(true);
    });
});
