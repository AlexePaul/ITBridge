import { Test, TestingModule } from '@nestjs/testing';
import { ParentNotificationsJob, EARNED_DEDUPE_PREFIX } from './parent-notifications.job';
import { romanianDate } from 'src/modules/mail/romanian-date';
import { MakeUpCredit } from 'src/entities/make-up-credit.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('ParentNotificationsJob', () => {
    let job: ParentNotificationsJob;
    let creditRepo: MockRepository;
    let outbox: { queueOrRecord: jest.Mock };

    /** A fixed day, so nothing here depends on when the suite runs. */
    const DAY = new Date(2026, 8, 7);

    const parent = (id: number, firstName = 'Ana', email: string | null = 'ana@example.com') => ({ id, firstName, email });
    beforeEach(async () => {
        creditRepo = createMockRepository();
        outbox = { queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };

        creditRepo.find!.mockResolvedValue([]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ParentNotificationsJob,
                provideMockRepository(MakeUpCredit, creditRepo),
                { provide: OutboxService, useValue: outbox },
                // The real template service over an empty override repo, so the wording asserted
                // below is the wording that actually ships.
                MailTemplateService,
                provideMockRepository(MailTemplate, createMockRepository()),
            ],
        }).compile();
        job = module.get(ParentNotificationsJob);
    });

    const queuedMessage = () => outbox.queueOrRecord.mock.calls[0][1] as { subject: string; bodyText: string; dedupeKey: string };

    describe('telling a family they earned a make-up', () => {
        const credit = (id: number, parentId = 1, childName = 'Maria') => ({
            id,
            expiresOn: new Date(2026, 9, 7),
            createdAt: DAY,
            child: { id: id + 10, firstName: childName, parent: parent(parentId) },
            originSession: { group: { name: 'Scratch' } },
        });

        it('writes to the family, naming the child and the last usable day', async () => {
            creditRepo.find!.mockResolvedValue([credit(1)]);

            const result = await job.notifyCreditsEarned(DAY);

            expect(result.notified).toBe(1);
            expect(queuedMessage().bodyText).toContain('Maria');
            expect(queuedMessage().bodyText).toContain('7 octombrie');
        });

        it('one message per parent, not one per child', async () => {
            creditRepo.find!.mockResolvedValue([credit(1, 1, 'Maria'), credit(2, 1, 'Andrei')]);

            const result = await job.notifyCreditsEarned(DAY);

            expect(result.notified).toBe(1);
            const body = queuedMessage().bodyText;
            expect(body).toContain('Maria');
            expect(body).toContain('Andrei');
        });

        it('selects by the day the credit was created, not by the class it came from', async () => {
            await job.notifyCreditsEarned(DAY);

            // A register taken two days late still reaches the family on the evening it is taken —
            // which is the failure that made the old absence message unreliable.
            const where = (creditRepo.find!.mock.calls[0][0] as { where: { createdAt: unknown } }).where;
            expect(where.createdAt).toBeDefined();
        });

        it('writes nothing on a day nobody earned one', async () => {
            await expect(job.notifyCreditsEarned(DAY)).resolves.toMatchObject({ notified: 0 });
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('dedupes per parent per day', async () => {
            creditRepo.find!.mockResolvedValue([credit(1)]);
            await job.notifyCreditsEarned(DAY);
            expect(queuedMessage().dedupeKey).toBe(`${EARNED_DEDUPE_PREFIX}2026-09-07:1`);
        });

        it('hands a family with no address to the outbox anyway, so S5 records it', async () => {
            creditRepo.find!.mockResolvedValue([{ ...credit(1), child: { id: 11, firstName: 'Maria', parent: parent(1, 'Ana', null) } }]);

            await job.notifyCreditsEarned(DAY);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything());
        });
    });

    describe('romanianDate', () => {
        it('reads as a sentence, not as a column', () => {
            expect(romanianDate(new Date(2026, 9, 7))).toBe('7 octombrie');
        });

        it('accepts the string the driver returns for a date column', () => {
            expect(romanianDate('2026-01-15')).toBe('15 ianuarie');
        });
    });
});
