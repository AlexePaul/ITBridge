import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryLogService } from './delivery-log.service';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { createMockQueryBuilder, createMockRepository, MockQueryBuilder, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('DeliveryLogService', () => {
    let service: DeliveryLogService;
    let outboxRepo: MockRepository;
    let qb: MockQueryBuilder;

    beforeEach(async () => {
        outboxRepo = createMockRepository();
        qb = createMockQueryBuilder<Record<string, unknown>>({ many: [] });
        outboxRepo.createQueryBuilder!.mockReturnValue(qb);

        const module: TestingModule = await Test.createTestingModule({
            providers: [DeliveryLogService, provideMockRepository(OutboxMessage, outboxRepo)],
        }).compile();
        service = module.get(DeliveryLogService);
    });

    describe('the filters', () => {
        it('narrows on nothing when asked for nothing', async () => {
            await service.list();
            expect(qb.andWhereCalls).toHaveLength(0);
        });

        it('matches the recipient loosely — an admin remembers a name, not an address', async () => {
            await service.list({ to: 'popescu' });
            expect(qb.andWhereCalls[0]).toEqual(['message.to ILIKE :to', { to: '%popescu%' }]);
        });

        it('takes both ends of the day, so "until" includes the day itself', async () => {
            await service.list({ from: '2026-09-01', until: '2026-09-30' });

            const params = Object.assign({}, ...qb.andWhereCalls.map(([, p]) => p ?? {})) as Record<string, string>;
            expect(params.from).toBe('2026-09-01T00:00:00');
            // Not midnight: a message queued at nine in the evening on the last day is in the range
            // the admin asked for.
            expect(params.until).toBe('2026-09-30T23:59:59.999');
        });

        /**
         * The end-to-end case only fails between midnight and 03:00 in Bucharest, because that is
         * the only window where the school's day and Greenwich's disagree about which day it is.
         * CI ran there once and went red; on any other run the bug is invisible. So the rule is
         * pinned here, where it does not depend on what time the suite happens to start.
         */
        it("puts both ends on the school's clock, not the server's", async () => {
            await service.list({ from: '2026-09-01', until: '2026-09-30' });

            const clauses = qb.andWhereCalls.map(([sql]) => sql);
            expect(clauses).toEqual([
                'message.createdAt >= (:from)::timestamp AT TIME ZONE :zone',
                'message.createdAt <= (:until)::timestamp AT TIME ZONE :zone',
            ]);

            const params = Object.assign({}, ...qb.andWhereCalls.map(([, p]) => p ?? {})) as Record<string, string>;
            expect(params.zone).toBe('Europe/Bucharest');
        });

        it('caps the page, however large the caller asks for', async () => {
            await service.list({ limit: 100000 });
            expect(qb.take).toHaveBeenCalledWith(500);
        });

        it('has a page size without being asked', async () => {
            await service.list();
            expect(qb.take).toHaveBeenCalledWith(200);
        });
    });

    describe('the summary', () => {
        it('reports every state, including the ones with no rows', async () => {
            qb.getRawMany = jest.fn().mockResolvedValue([{ status: OutboxStatus.SENT, count: 12 }]);

            const summary = await service.summary();

            expect(summary[OutboxStatus.SENT]).toBe(12);
            // A missing "undeliverable: 0" reads as "not measured" rather than "none", which is
            // the opposite of what the number is for.
            expect(summary[OutboxStatus.UNDELIVERABLE]).toBe(0);
            expect(summary[OutboxStatus.PENDING]).toBe(0);
            expect(summary[OutboxStatus.FAILED]).toBe(0);
        });
    });
});
