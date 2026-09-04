import { bookingKeyFor, daysSince, isStale, STALE_LEAD_DAYS } from './lead.rules';

/**
 * The lines E20 draws — E20/S2 and S3.
 *
 * Plain functions, so these are the tests that can be written without a database, and therefore the
 * tests that will still be run in a year.
 */
describe('lead rules', () => {
    describe('daysSince, in calendar days on the school clock', () => {
        it('counts yesterday evening to this morning as one day, not zero', () => {
            // 18:00 to 09:00 is fifteen hours, and a person reading „de o zi" means exactly this:
            // one morning has passed in which nobody looked.
            const uploaded = new Date('2026-03-10T16:00:00Z');
            const read = new Date('2026-03-11T07:00:00Z');

            expect(daysSince(uploaded, read)).toBe(1);
        });

        it('counts two moments on the same school day as zero', () => {
            expect(daysSince(new Date('2026-03-10T06:00:00Z'), new Date('2026-03-10T20:00:00Z'))).toBe(0);
        });

        it('reads a time just after midnight in Bucharest as the new day, not the old one', () => {
            // 22:30 UTC is 00:30 the following morning in Bucharest. Counted on the school's clock
            // that is two days on from the 10th; counted through UTC it would be one, which is the
            // off-by-one that only appears in some time zones and never at review.
            const then = new Date('2026-03-10T10:00:00Z');
            const now = new Date('2026-03-11T22:30:00Z');

            expect(daysSince(then, now)).toBe(2);
        });

        it('never goes negative when the clock disagrees with itself', () => {
            expect(daysSince(new Date('2026-03-11T09:00:00Z'), new Date('2026-03-10T09:00:00Z'))).toBe(0);
        });
    });

    describe('isStale', () => {
        it('is false the day before the threshold and true on it', () => {
            const touched = new Date('2026-03-01T09:00:00Z');
            const dayBefore = new Date(`2026-03-0${STALE_LEAD_DAYS}T09:00:00Z`);
            const onIt = new Date(`2026-03-0${STALE_LEAD_DAYS + 1}T09:00:00Z`);

            expect(isStale(touched, dayBefore)).toBe(false);
            expect(isStale(touched, onIt)).toBe(true);
        });
    });

    describe('bookingKeyFor', () => {
        const base = { childFirstName: 'Matei Popescu', childBirthDate: '2016-04-04', classSessionId: 7, contact: 'ioana@example.com' };

        it('gives two presses of the same form the same key', () => {
            expect(bookingKeyFor(base)).toBe(bookingKeyFor({ ...base }));
        });

        it('ignores case, diacritics and stray spaces, which a phone keyboard adds freely', () => {
            expect(bookingKeyFor({ ...base, childFirstName: '  Matei Popescu  ' })).toBe(bookingKeyFor(base));
            expect(bookingKeyFor({ ...base, childFirstName: 'MATEI POPESCU' })).toBe(bookingKeyFor(base));
            expect(bookingKeyFor({ ...base, childFirstName: 'Ștefan Popescu' })).toBe(bookingKeyFor({ ...base, childFirstName: 'stefan popescu' }));
        });

        it('separates a second child in the same family, who is a second booking', () => {
            expect(bookingKeyFor({ ...base, childFirstName: 'Ana Popescu' })).not.toBe(bookingKeyFor(base));
            expect(bookingKeyFor({ ...base, childBirthDate: '2018-01-01' })).not.toBe(bookingKeyFor(base));
        });

        it('separates the same child booked into a different class', () => {
            expect(bookingKeyFor({ ...base, classSessionId: 8 })).not.toBe(bookingKeyFor(base));
        });

        it('has a key for the request that found no class at all', () => {
            expect(bookingKeyFor({ ...base, classSessionId: null })).toHaveLength(64);
        });
    });
});
