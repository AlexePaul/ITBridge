import { hasExpired, makeUpExpiryFor } from './make-up.rules';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * The window of E12/S4, which is **the week the class was missed in**.
 *
 * 7 September 2026 is a Monday, so that week closes on Sunday the 13th. Every case below is about
 * one of two things: that the window is the week rather than a count of days, and that it is built
 * from local calendar components — the trap `class-session.dates.ts` exists for.
 */
describe('makeUpExpiryFor', () => {
    it('ends on the Sunday that closes the week of the missed class', () => {
        // Wednesday the 9th.
        expect(toIsoDate(makeUpExpiryFor(new Date(2026, 8, 9)))).toBe('2026-09-13');
    });

    it('gives every class of one week the same last day', () => {
        // Monday and Saturday of the same week expire together. The window belongs to the week, not
        // to the class — a Monday absence does not buy six days more than a Saturday one.
        expect(toIsoDate(makeUpExpiryFor('2026-09-07'))).toBe('2026-09-13');
        expect(toIsoDate(makeUpExpiryFor('2026-09-12'))).toBe('2026-09-13');
    });

    it('a Sunday class expires the same day, not a week later', () => {
        // ISO weeks end on Sunday, so Sunday is the last day of its own week. Reading Sunday as the
        // start of the next one would hand that family seven extra days nobody granted.
        expect(toIsoDate(makeUpExpiryFor('2026-09-13'))).toBe('2026-09-13');
    });

    it('accepts the string the driver hands back for a date column', () => {
        expect(toIsoDate(makeUpExpiryFor('2026-09-09'))).toBe('2026-09-13');
    });

    it('crosses a month boundary with the week, not with the calendar', () => {
        // Wednesday 30 September 2026 sits in the week that closes on Sunday 4 October.
        expect(toIsoDate(makeUpExpiryFor('2026-09-30'))).toBe('2026-10-04');
    });

    it('crosses a year boundary the same way', () => {
        // Thursday 31 December 2026 is in the week closing Sunday 3 January 2027.
        expect(toIsoDate(makeUpExpiryFor('2026-12-31'))).toBe('2027-01-03');
    });

    it('lands on a real day across the autumn clock change', () => {
        // Romania puts the clocks back on the last Sunday of October — 25 October in 2026, which is
        // itself the end of its week. A window built by adding milliseconds would answer the 24th at
        // 23:00 here, and a family told Sunday would hold something the platform thinks died on
        // Saturday. `endOfIsoWeek` walks local components, so it does not.
        expect(toIsoDate(makeUpExpiryFor('2026-10-20'))).toBe('2026-10-25');
    });
});

describe('hasExpired', () => {
    it('the last day is still usable — the window is inclusive', () => {
        expect(hasExpired('2026-09-13', new Date(2026, 8, 13))).toBe(false);
    });

    it('the Monday after is not', () => {
        expect(hasExpired('2026-09-13', new Date(2026, 8, 14))).toBe(true);
    });

    it('compares calendar days, so an hour of the evening does not expire anything', () => {
        expect(hasExpired('2026-09-13', new Date(2026, 8, 13, 23, 59))).toBe(false);
    });
});
