import { hasExpired, makeUpExpiryFor, MAKE_UP_VALIDITY_DAYS } from './make-up.rules';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';

describe('makeUpExpiryFor', () => {
    it('gives thirty days from the class that was missed', () => {
        expect(toIsoDate(makeUpExpiryFor(new Date(2026, 8, 7)))).toBe('2026-10-07');
        expect(MAKE_UP_VALIDITY_DAYS).toBe(30);
    });

    it('accepts the string the driver hands back for a date column', () => {
        expect(toIsoDate(makeUpExpiryFor('2026-09-07'))).toBe('2026-10-07');
    });

    it('crosses a month boundary without arithmetic of its own', () => {
        expect(toIsoDate(makeUpExpiryFor('2026-12-20'))).toBe('2027-01-19');
    });

    it('gives every family the same window, whatever day they missed', () => {
        // The rejected alternative — "until the end of next month" — hands a child who misses on
        // the 2nd almost eight weeks and one who misses on the 30th barely four.
        //
        // Counted in calendar days, not in milliseconds: 30 September plus thirty days lands on 30
        // October, which is *after* the clocks go back, so the same window is an hour longer in
        // elapsed time than the one starting on 2 September. That is exactly why `addDays` walks
        // local components instead of adding a duration — the promise to a family is "thirty days",
        // and thirty days is what they get on both sides of the change.
        expect(toIsoDate(makeUpExpiryFor('2026-09-02'))).toBe('2026-10-02');
        expect(toIsoDate(makeUpExpiryFor('2026-09-30'))).toBe('2026-10-30');
    });

    it('lands on a real day across the autumn clock change, not an hour before midnight', () => {
        // Romania puts the clocks back on the last Sunday of October. A naive `+ 30 * 86400000`
        // would answer 29 October at 23:00 here, and `toIsoDate` would then say the 29th — a
        // family told the 30th, holding a credit the platform thinks died a day early.
        expect(toIsoDate(makeUpExpiryFor('2026-09-30'))).toBe('2026-10-30');
        expect(toIsoDate(makeUpExpiryFor('2026-10-01'))).toBe('2026-10-31');
    });
});

describe('hasExpired', () => {
    it('the last day is still usable — the window is inclusive', () => {
        expect(hasExpired('2026-10-07', new Date(2026, 9, 7))).toBe(false);
    });

    it('the day after is not', () => {
        expect(hasExpired('2026-10-07', new Date(2026, 9, 8))).toBe(true);
    });

    it('compares calendar days, so an hour of the evening does not expire anything', () => {
        expect(hasExpired('2026-10-07', new Date(2026, 9, 7, 23, 59))).toBe(false);
    });
});
