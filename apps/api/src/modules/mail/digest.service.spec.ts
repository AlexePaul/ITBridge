import { Test, TestingModule } from '@nestjs/testing';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { Profile } from 'src/entities/profile.entity';
import { MessageFrequency } from 'src/enum/message-frequency.enum';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import {
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    MockQueryBuilder,
    MockRepository,
    provideMockDataSource,
} from 'src/testing/repository.mock';
import { DigestService } from './digest.service';

/**
 * Digests instead of bursts — E17/S6.
 *
 * The pass has one job with three outcomes: hold, release, or fold. What the tests below pin is
 * which of the three, and why — the schedule arithmetic that decides *when* has its own suite in
 * `digest.rules.spec.ts` and is not re-checked here.
 */
describe('DigestService', () => {
    let service: DigestService;
    let profileRepo: MockRepository;
    let manager: ReturnType<typeof createMockEntityManager> & { createQueryBuilder?: jest.Mock };
    let held: Partial<OutboxMessage>[];
    let inserted: Record<string, unknown>[];

    /** Monday 10:00 Bucharest — before the evening cutoff, so nothing daily is due yet. */
    const morning = new Date('2026-03-02T08:00:00.000Z');
    /** Monday 18:00 Bucharest — the cutoff itself. */
    const evening = new Date('2026-03-02T16:00:00.000Z');

    const message = (overrides: Partial<OutboxMessage> = {}): Partial<OutboxMessage> => ({
        id: 1,
        to: 'ana@example.com',
        subject: 'Ai o oră de recuperare',
        bodyText: 'Bună, Ana!',
        digestSummary: 'Ora pierdută se recuperează.',
        digestNotAfter: null,
        digestReleasedAt: null,
        status: OutboxStatus.PENDING,
        createdAt: morning,
        ...overrides,
    });

    const withProfile = (frequency: MessageFrequency, firstName = 'Ana') => {
        profileRepo.findOne!.mockResolvedValue({ firstName, messageFrequency: frequency });
    };

    beforeEach(async () => {
        held = [];
        inserted = [];
        profileRepo = createMockRepository();

        manager = createMockEntityManager(new Map([[Profile, profileRepo]]));

        const insertQb: Record<string, jest.Mock> = {};
        for (const method of ['insert', 'into', 'returning']) insertQb[method] = jest.fn(() => insertQb);
        insertQb.values = jest.fn((values: Record<string, unknown>) => {
            inserted.push(values);
            return insertQb;
        });
        insertQb.execute = jest.fn().mockResolvedValue({ raw: [{ id: 99 }] });

        // The manager's builder is a select when given an entity and an alias, an insert when given
        // nothing — the two shapes the mock helper deliberately refuses to guess between.
        manager.createQueryBuilder = jest.fn((entity?: unknown) => {
            if (entity === undefined) return insertQb;
            return createMockQueryBuilder<OutboxMessage>({ many: held as OutboxMessage[] });
        });

        const module: TestingModule = await Test.createTestingModule({
            providers: [DigestService, provideMockDataSource(manager)],
        }).compile();
        service = module.get(DigestService);
    });

    describe('holding', () => {
        it('leaves a daily family alone until the evening', async () => {
            held = [message()];
            withProfile(MessageFrequency.DAILY);

            const result = await service.run({ now: morning });

            expect(result).toMatchObject({ held: 1, released: 0, digests: 0 });
            expect(manager.update).not.toHaveBeenCalled();
        });
    });

    describe('releasing', () => {
        it('sends a lone message as itself — one thing is not a digest', async () => {
            held = [message()];
            withProfile(MessageFrequency.DAILY);

            const result = await service.run({ now: evening });

            expect(result).toMatchObject({ released: 1, digests: 0, folded: 0 });
            expect(manager.update).toHaveBeenCalledWith(OutboxMessage, [1], { digestReleasedAt: evening });
        });

        /**
         * A family who asked for each message as it happens gets each message as it happens.
         * Combining them anyway would make the setting mean something other than what it says.
         */
        it('never combines for a family who chose immediate, however many are waiting', async () => {
            held = [message({ id: 1 }), message({ id: 2, subject: 'Proiectele lui Maria' })];
            withProfile(MessageFrequency.IMMEDIATE);

            const result = await service.run({ now: morning });

            expect(result).toMatchObject({ released: 2, digests: 0 });
            expect(inserted).toHaveLength(0);
        });

        /** The office's own mail: no profile, so no preference to honour, and never held. */
        it('treats an address with no profile as immediate', async () => {
            held = [message({ to: 'office@itbridgeschool.com' })];
            profileRepo.findOne!.mockResolvedValue(null);

            const result = await service.run({ now: morning });

            expect(result).toMatchObject({ released: 1, digests: 0 });
        });
    });

    describe('folding', () => {
        beforeEach(() => {
            held = [message({ id: 1 }), message({ id: 2, subject: 'Proiectele lui Maria', digestSummary: 'Maria a construit un joc.' })];
            withProfile(MessageFrequency.DAILY);
        });

        it('writes one combined message carrying every fragment', async () => {
            const result = await service.run({ now: evening });

            expect(result).toMatchObject({ digests: 1, folded: 2, released: 0 });
            expect(inserted).toHaveLength(1);
            expect(inserted[0]).toMatchObject({ to: 'ana@example.com' });
            expect(inserted[0].bodyText).toContain('Ora pierdută se recuperează.');
            expect(inserted[0].bodyText).toContain('Maria a construit un joc.');
            expect(inserted[0].bodyText).toContain('Bună, Ana!');
        });

        /** The combined message is the thing everybody was waiting for; it cannot wait for itself. */
        it('does not make the digest itself digestible', async () => {
            await service.run({ now: evening });
            expect(inserted[0]).toMatchObject({ digestSummary: null });
        });

        /**
         * `digested`, never `sent`: these rows were not handed to the provider, and a record saying
         * otherwise would answer „a primit părintele anunțul?" with a message nobody posted. They
         * point at the row that did go — S5's rule that nothing disappears.
         */
        it('marks the parts as digested and points them at the message that went', async () => {
            await service.run({ now: evening });

            expect(manager.update).toHaveBeenCalledWith(OutboxMessage, [1, 2], {
                status: OutboxStatus.DIGESTED,
                digestReleasedAt: evening,
                digest: { id: 99 },
            });
        });

        /**
         * The straggler rides along. Without this the cap leaks: message A comes due, goes out
         * alone, and B — queued ten minutes later — arrives as a second email the same evening.
         */
        it('takes a not-yet-due message along once any of the group is due', async () => {
            held = [message({ id: 1, createdAt: morning }), message({ id: 2, createdAt: evening, subject: 'Factura pe martie' })];

            const result = await service.run({ now: evening });

            expect(result).toMatchObject({ digests: 1, folded: 2 });
        });
    });

    describe('separate families', () => {
        it('never puts two inboxes in one envelope', async () => {
            held = [message({ id: 1, to: 'ana@example.com' }), message({ id: 2, to: 'bogdan@example.com' })];
            withProfile(MessageFrequency.DAILY);

            const result = await service.run({ now: evening });

            // Two groups of one: each goes as itself, and neither can see the other's message.
            expect(result).toMatchObject({ released: 2, digests: 0 });
        });
    });

    describe('the claim', () => {
        it('asks for the lock that makes two overlapping passes safe', async () => {
            held = [message()];
            withProfile(MessageFrequency.DAILY);
            let claim: MockQueryBuilder<OutboxMessage> | undefined;
            manager.createQueryBuilder = jest.fn((entity?: unknown) => {
                if (entity === undefined) throw new Error('not expected in this test');
                claim = createMockQueryBuilder<OutboxMessage>({ many: held as OutboxMessage[] });
                return claim;
            });

            await service.run({ now: morning });

            expect(claim?.setLock).toHaveBeenCalledWith('pessimistic_write');
            expect(claim?.setOnLocked).toHaveBeenCalledWith('skip_locked');
        });
    });
});
