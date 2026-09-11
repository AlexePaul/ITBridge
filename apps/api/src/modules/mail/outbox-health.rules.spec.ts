import { STUCK_AFTER_MINUTES, stuckBefore } from './outbox-health.rules';

/** The line between a message on its way and a message nobody is carrying — E17/S5. */
describe('outbox health rules', () => {
    const now = new Date('2026-09-12T10:00:00.000Z');

    describe('stuckBefore', () => {
        it('is the moment a due message stops being merely late', () => {
            expect(stuckBefore(now).toISOString()).toBe('2026-09-12T09:45:00.000Z');
        });

        it('leaves room for many missed passes, so an ordinary tick can never trip it', () => {
            // The dispatcher polls every 30 seconds, so the window has to be worth more than one
            // slow pass. Thirty of them is a quarter of an hour.
            const pollIntervalMs = 30_000;
            expect((STUCK_AFTER_MINUTES * 60_000) / pollIntervalMs).toBeGreaterThanOrEqual(20);
        });

        it('moves with the clock it is given, rather than with the wall', () => {
            const later = new Date(now.getTime() + 60 * 60_000);
            expect(stuckBefore(later).getTime() - stuckBefore(now).getTime()).toBe(60 * 60_000);
        });
    });
});
