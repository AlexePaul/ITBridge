import { Test, TestingModule } from '@nestjs/testing';
import { OutboxService } from './outbox.service';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { MailService } from './mail.service';
import { S3Service } from 'src/modules/storage/s3.service';
import { createMockEntityManager, createMockRepository, MockRepository, provideMockDataSource, provideMockRepository } from 'src/testing/repository.mock';

/**
 * The guarantee of E17/S4: a preference gates marketing and nothing else.
 *
 * These tests are about a promise more than a mechanism. The story's acceptance is that
 * unsubscribing does not stop invoices or the child's work — so the interesting assertions are the
 * ones about what a refusal does *not* prevent.
 */
describe('marketing consent', () => {
    let service: OutboxService;
    let outboxRepo: MockRepository;
    let insertValues: Record<string, unknown>[];

    beforeEach(async () => {
        outboxRepo = createMockRepository();
        insertValues = [];
        const qb: Record<string, jest.Mock> = {};
        for (const method of ['insert', 'into', 'orIgnore', 'returning']) qb[method] = jest.fn(() => qb);
        qb.values = jest.fn((v: Record<string, unknown>) => {
            insertValues.push(v);
            return qb;
        });
        qb.execute = jest.fn().mockResolvedValue({ raw: [{ id: 1 }] });
        outboxRepo.createQueryBuilder!.mockReturnValue(qb);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OutboxService,
                provideMockRepository(OutboxMessage, outboxRepo),
                provideMockDataSource(createMockEntityManager()),
                { provide: MailService, useValue: { send: jest.fn() } },
                { provide: S3Service, useValue: {} },
            ],
        }).compile();
        service = module.get(OutboxService);
    });

    const note = { subject: 'Tabăra de vară', bodyText: 'Se deschid înscrierile.' };

    it('sends marketing to a family that agreed', async () => {
        await service.queueMarketing({ email: 'ana@example.com', marketingOptIn: true }, note);
        expect(insertValues[0]).toMatchObject({ to: 'ana@example.com' });
    });

    it('declines for a family that did not, and writes nothing at all', async () => {
        const queued = await service.queueMarketing({ email: 'ana@example.com', marketingOptIn: false }, note);

        expect(queued).toBeNull();
        // Deliberately not an `undeliverable` row: a parent who said no and does not receive a
        // newsletter is the system working. S5's record is for messages that should have arrived
        // and did not, and filling it with correct outcomes would bury the real ones.
        expect(insertValues).toHaveLength(0);
    });

    it('a family that refused marketing still gets their invoice', async () => {
        // The acceptance criterion, as an assertion: the ordinary queue takes no preference at all,
        // so there is no argument anybody could pass that would stop a transactional message.
        await service.queue({ to: 'ana@example.com', subject: 'Factura pe martie', bodyText: '350 lei' });
        expect(insertValues[0]).toMatchObject({ to: 'ana@example.com', subject: 'Factura pe martie' });
    });

    it("and still gets their child's work, which is not on a checkbox at all", async () => {
        await service.queueOrRecord({ email: 'ana@example.com' }, { subject: 'Proiectele Anei', bodyText: '...' });
        expect(insertValues[0]).toMatchObject({ subject: 'Proiectele Anei' });
    });

    it('marketing to a family with no address is undeliverable, not silently dropped', async () => {
        // Opted in, but there is nowhere to send: that *is* a failure, and S5's rule applies.
        await service.queueMarketing({ email: null, marketingOptIn: true }, note);
        expect(insertValues[0]).toMatchObject({ status: 'undeliverable', undeliverableReason: 'no_address' });
    });
});
