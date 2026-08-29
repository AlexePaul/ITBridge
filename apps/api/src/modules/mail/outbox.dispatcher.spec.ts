import { OutboxDispatcher } from './outbox.dispatcher';
import { OutboxService } from './outbox.service';

/**
 * The dispatcher decides only *when*, so this is about the three ways a timer misbehaves: firing
 * when it was turned off, firing on top of itself, and taking the process down with it.
 *
 * It is constructed directly rather than through `Test.createTestingModule`, because the switch is
 * read in the constructor and each case needs a different environment.
 */
describe('OutboxDispatcher', () => {
    let outbox: { dispatchPending: jest.Mock };

    function createDispatcher(): OutboxDispatcher {
        return new OutboxDispatcher(outbox as unknown as OutboxService);
    }

    beforeEach(() => {
        outbox = { dispatchPending: jest.fn().mockResolvedValue({ claimed: 0, sent: 0, failed: 0 }) };
        delete process.env.MAIL_OUTBOX_ENABLED;
    });

    afterEach(() => {
        delete process.env.MAIL_OUTBOX_ENABLED;
    });

    it('runs a pass on every tick by default', async () => {
        await createDispatcher().tick();

        expect(outbox.dispatchPending).toHaveBeenCalledTimes(1);
    });

    it('does nothing when MAIL_OUTBOX_ENABLED is false', async () => {
        process.env.MAIL_OUTBOX_ENABLED = 'false';

        await createDispatcher().tick();

        expect(outbox.dispatchPending).not.toHaveBeenCalled();
    });

    // Any other value leaves it on. The switch exists to turn the scheduler off deliberately, not
    // to make a typo in the environment silently stop every notification the school sends.
    it('stays on for anything other than an explicit false', async () => {
        process.env.MAIL_OUTBOX_ENABLED = 'yes';

        await createDispatcher().tick();

        expect(outbox.dispatchPending).toHaveBeenCalledTimes(1);
    });

    /**
     * Ticks arrive every thirty seconds whether or not the previous pass has finished. A slow
     * provider would otherwise let them pile up, each opening its own claim, each holding its own
     * connection.
     */
    it('skips a tick that lands while the previous pass is still running', async () => {
        let release: () => void = () => undefined;
        outbox.dispatchPending.mockReturnValue(
            new Promise((resolve) => {
                release = () => resolve({ claimed: 1, sent: 1, failed: 0 });
            }),
        );
        const dispatcher = createDispatcher();

        const first = dispatcher.tick();
        await dispatcher.tick();
        expect(outbox.dispatchPending).toHaveBeenCalledTimes(1);

        release();
        await first;

        // ...and the next tick after it finishes runs normally.
        await dispatcher.tick();
        expect(outbox.dispatchPending).toHaveBeenCalledTimes(2);
    });

    /**
     * A pass that throws is a database problem, not a delivery one: the messages are still on the
     * table. What must not happen is an unhandled rejection out of a timer callback, which in Node
     * takes the process down and stops every other job with it.
     */
    it('swallows a failed pass and keeps ticking', async () => {
        outbox.dispatchPending.mockRejectedValueOnce(new Error('connection terminated'));
        const dispatcher = createDispatcher();

        await expect(dispatcher.tick()).resolves.toBeUndefined();

        await dispatcher.tick();
        expect(outbox.dispatchPending).toHaveBeenCalledTimes(2);
    });
});
