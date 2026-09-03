import { daysWaiting, isStale, STALE_PENDING_DAYS } from './pending.rules';

/**
 * How long a document has been waiting — E17/S8.
 *
 * Small, and worth its own file for one reason: the number goes on a screen as „de 3 zile", and a
 * reader counting mornings they did not look means something different from 72 elapsed hours. Every
 * case below is the difference between those two readings.
 */
describe('pending document age', () => {
    const at = (iso: string) => new Date(iso);

    describe('daysWaiting', () => {
        it('is zero on the day of the upload', () => {
            expect(daysWaiting(at('2026-03-02T08:00:00.000Z'), at('2026-03-02T20:00:00.000Z'))).toBe(0);
        });

        /**
         * The case that makes this calendar arithmetic rather than elapsed time: fifteen hours have
         * passed, which `Math.floor` on milliseconds would call zero days — while the admin reading
         * it has had one morning go by without looking.
         */
        it('is one the next morning, however few hours have passed', () => {
            expect(daysWaiting(at('2026-03-02T18:00:00.000Z'), at('2026-03-03T09:00:00.000Z'))).toBe(1);
        });

        it('counts a Friday upload read on Monday as three days', () => {
            expect(daysWaiting(at('2026-03-06T16:00:00.000Z'), at('2026-03-09T09:00:00.000Z'))).toBe(3);
        });

        it('crosses a month end', () => {
            expect(daysWaiting(at('2026-03-30T10:00:00.000Z'), at('2026-04-02T10:00:00.000Z'))).toBe(3);
        });

        /** A clock skew or a backdated row must not read as a negative age on a screen. */
        it('never goes below zero', () => {
            expect(daysWaiting(at('2026-03-05T10:00:00.000Z'), at('2026-03-02T10:00:00.000Z'))).toBe(0);
        });
    });

    describe('isStale', () => {
        it('says nothing when nothing is waiting', () => {
            expect(isStale(null)).toBe(false);
        });

        it('leaves a fresh queue alone — a Friday upload looked at Monday is a weekend, not a lapse', () => {
            expect(isStale(STALE_PENDING_DAYS - 1)).toBe(false);
        });

        it('flags the queue once it reaches the line', () => {
            expect(isStale(STALE_PENDING_DAYS)).toBe(true);
            expect(isStale(STALE_PENDING_DAYS + 5)).toBe(true);
        });
    });
});
