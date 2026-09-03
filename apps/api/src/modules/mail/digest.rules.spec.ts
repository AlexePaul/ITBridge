import { MessageFrequency } from 'src/enum/message-frequency.enum';
import { DIGEST_HOUR, isDue, releaseStampFor } from './digest.rules';

/**
 * When a held message is allowed out — E17/S6.
 *
 * The whole file is calendar arithmetic on the school's wall clock, which is exactly the kind of
 * code that is right in one time zone and a day out in another. Every instant below is written in
 * UTC and asserted against a Bucharest stamp, so the conversion is what is under test rather than
 * an assumption shared with the implementation.
 */
describe('digest release rules', () => {
    // Bucharest is UTC+2 in winter and UTC+3 in summer; both are exercised below.
    const winterMorning = new Date('2026-03-02T08:00:00.000Z'); // Monday 10:00 Bucharest
    const winterEvening = new Date('2026-03-02T20:00:00.000Z'); // Monday 22:00 Bucharest

    describe('immediate', () => {
        it('is due the moment it is written', () => {
            expect(releaseStampFor(winterMorning, MessageFrequency.IMMEDIATE)).toBe('2026-03-02T10:00');
        });
    });

    describe('daily', () => {
        it('waits for this evening when the message arrives before the cutoff', () => {
            expect(releaseStampFor(winterMorning, MessageFrequency.DAILY)).toBe(`2026-03-02T${DIGEST_HOUR}:00`);
        });

        /**
         * The reason the schedule is computed per message rather than from a shared 18:00: anchored
         * to the hour alone, a message written at 22:00 would find today's cutoff already past and
         * go out at once — a second email on a day that had already had its one.
         */
        it('waits for tomorrow when the message arrives after it', () => {
            expect(releaseStampFor(winterEvening, MessageFrequency.DAILY)).toBe(`2026-03-03T${DIGEST_HOUR}:00`);
        });

        it('crosses a month end as a calendar operation, not as arithmetic on a number', () => {
            const lastNightOfMarch = new Date('2026-03-31T20:00:00.000Z');
            expect(releaseStampFor(lastNightOfMarch, MessageFrequency.DAILY)).toBe(`2026-04-01T${DIGEST_HOUR}:00`);
        });
    });

    describe('weekly', () => {
        it('waits for the coming Monday', () => {
            const wednesday = new Date('2026-03-04T08:00:00.000Z');
            expect(releaseStampFor(wednesday, MessageFrequency.WEEKLY)).toBe(`2026-03-09T${DIGEST_HOUR}:00`);
        });

        it('goes out the same evening when it is written on a Monday morning', () => {
            expect(releaseStampFor(winterMorning, MessageFrequency.WEEKLY)).toBe(`2026-03-02T${DIGEST_HOUR}:00`);
        });

        it('waits a full week when it is written on a Monday night', () => {
            expect(releaseStampFor(winterEvening, MessageFrequency.WEEKLY)).toBe(`2026-03-09T${DIGEST_HOUR}:00`);
        });
    });

    /**
     * Summer time. The same wall-clock hour is a different instant, and reading the cutoff off a
     * fixed UTC offset would release an hour early for half the year.
     */
    describe('across the daylight-saving change', () => {
        it('reads the cutoff on the school clock, not on a fixed offset', () => {
            // 16:30 UTC is 19:30 in Bucharest in July — past the cutoff, so this waits for tomorrow.
            const julyAfternoon = new Date('2026-07-15T16:30:00.000Z');
            expect(releaseStampFor(julyAfternoon, MessageFrequency.DAILY)).toBe(`2026-07-16T${DIGEST_HOUR}:00`);

            // 14:30 UTC is 17:30 the same day — still before it.
            const earlier = new Date('2026-07-15T14:30:00.000Z');
            expect(releaseStampFor(earlier, MessageFrequency.DAILY)).toBe(`2026-07-15T${DIGEST_HOUR}:00`);
        });
    });

    describe('isDue', () => {
        const held = (createdAt: Date, digestNotAfter: string | null = null) => ({ createdAt, digestNotAfter });

        it('holds a daily message through the afternoon', () => {
            const atNoon = new Date('2026-03-02T10:00:00.000Z'); // 12:00 Bucharest
            expect(isDue(held(winterMorning), MessageFrequency.DAILY, atNoon)).toBe(false);
        });

        it('lets it out once the evening cutoff passes', () => {
            const atSix = new Date('2026-03-02T16:00:00.000Z'); // 18:00 Bucharest
            expect(isDue(held(winterMorning), MessageFrequency.DAILY, atSix)).toBe(true);
        });

        /**
         * The safety valve, and the reason the weekly cadence is a preference rather than a bug:
         * E12's make-up warning is written seven days before the right lapses, so a digest that held
         * it for a week would deliver a warning about something already gone.
         */
        it('releases a message whose last useful day has come, whatever the cadence says', () => {
            const written = new Date('2026-03-03T08:00:00.000Z'); // Tuesday; weekly would wait to Monday
            const deadlineDay = new Date('2026-03-05T08:00:00.000Z'); // Thursday

            expect(isDue(held(written, '2026-03-10'), MessageFrequency.WEEKLY, deadlineDay)).toBe(false);
            expect(isDue(held(written, '2026-03-05'), MessageFrequency.WEEKLY, deadlineDay)).toBe(true);
        });

        it('does not release early just because a deadline exists', () => {
            const written = new Date('2026-03-03T08:00:00.000Z');
            const wednesday = new Date('2026-03-04T08:00:00.000Z');
            expect(isDue(held(written, '2026-03-20'), MessageFrequency.WEEKLY, wednesday)).toBe(false);
        });
    });
});
