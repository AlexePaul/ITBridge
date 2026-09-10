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

    /** A family that agreed, with the token every profile carries — E17/S4. */
    const willing = { email: 'ana@example.com', marketingOptIn: true, unsubscribeToken: 'jeton-de-test' };

    it('sends marketing to a family that agreed', async () => {
        await service.queueMarketing(willing, note);
        expect(insertValues[0]).toMatchObject({ to: 'ana@example.com' });
    });

    it('declines for a family that did not, and writes nothing at all', async () => {
        const queued = await service.queueMarketing({ ...willing, marketingOptIn: false }, note);

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
        await service.queueMarketing({ ...willing, email: null }, note);
        expect(insertValues[0]).toMatchObject({ status: 'undeliverable', undeliverableReason: 'no_address' });
    });

    describe('the way out, in the message — E17/S4', () => {
        it('carries a link that stops them, on every marketing message', async () => {
            await service.queueMarketing(willing, note);

            // Legea 506/2004 art. 12 wants the refusal reachable from the message itself. Asserted
            // on the queued row rather than on a template, because the footer is added at this one
            // door precisely so no sender can be the one that forgets.
            expect(insertValues[0].bodyText).toContain('/dezabonare?token=jeton-de-test');
        });

        it('says what stopping them does not cost', async () => {
            await service.queueMarketing(willing, note);

            // The sentence matters as much as the link: a family that thinks refusing a newsletter
            // might also stop the invoice or the child's work will not refuse, and consent that is
            // not freely refusable is not consent (E17/S4's argument, from the other side).
            expect(insertValues[0].bodyText).toContain('Nu afectează facturile');
        });

        it('keeps the message itself intact above it', async () => {
            await service.queueMarketing(willing, note);

            expect(insertValues[0].bodyText).toContain('Se deschid înscrierile.');
        });

        it('adds it to the HTML body too, when there is one', async () => {
            await service.queueMarketing(willing, { ...note, bodyHtml: '<p>Se deschid înscrierile.</p>' });

            expect(insertValues[0].bodyHtml).toContain('<p>Se deschid înscrierile.</p>');
            expect(insertValues[0].bodyHtml).toContain('href="https://itbridgeschool.com/dezabonare?token=jeton-de-test"');
        });

        it('puts nothing in the ordinary queue, which is not marketing', async () => {
            // An invoice with an unsubscribe link would be telling a family they can opt out of
            // being billed. The footer belongs to the one door marketing goes through, and to it
            // alone.
            await service.queue({ to: 'ana@example.com', subject: 'Factura pe martie', bodyText: '350 lei' });

            expect(insertValues[0].bodyText).not.toContain('/dezabonare');
        });

        it('refuses to send at all when the profile has no token', async () => {
            // Every profile is given one on insert, so this is a row written around the entity.
            // Throwing is the point: the alternative repair is an unlawful e-mail.
            await expect(service.queueMarketing({ ...willing, unsubscribeToken: '' }, note)).rejects.toThrow(/unsubscribe token/);
            expect(insertValues).toHaveLength(0);
        });
    });
});
