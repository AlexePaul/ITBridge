import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan } from 'typeorm';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { Session } from 'src/entities/session.entity';
import { SessionService } from './session.service';

/**
 * The service that decides whether a refresh token is still allowed to work.
 *
 * It had no unit spec at all — 19% statement coverage, 0% of its functions — while carrying the
 * whole of E05/S7. The concurrent-rotation defect the review found lives in `rotate`, which needs a
 * real database to reproduce (`sessions.e2e-spec.ts` and `review-fixes-e05.e2e-spec.ts` cover it).
 * What belongs here is everything that does not: the shape of the queries, and the promises the
 * service makes about what it never returns.
 */
describe('SessionService', () => {
    let service: SessionService;
    let sessionRepo: MockRepository;
    let dataSource: { transaction: jest.Mock };

    beforeEach(async () => {
        sessionRepo = createMockRepository();
        dataSource = { transaction: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [SessionService, provideMockRepository(Session, sessionRepo), { provide: getDataSourceToken(), useValue: dataSource }],
        }).compile();

        service = module.get(SessionService);
    });

    afterEach(() => {
        service.onModuleDestroy();
    });

    describe('hashing', () => {
        it('never stores the token itself', () => {
            const token = 'un-refresh-token';
            const hash = SessionService.hash(token);

            expect(hash).not.toContain(token);
            expect(hash).toMatch(/^[0-9a-f]{64}$/);
        });

        it('is deterministic, because every refresh looks a token up by hash', () => {
            expect(SessionService.hash('acelasi')).toBe(SessionService.hash('acelasi'));
            expect(SessionService.hash('acelasi')).not.toBe(SessionService.hash('altul'));
        });
    });

    describe('revoke', () => {
        it('narrows on IsNull, not on undefined', async () => {
            sessionRepo.update!.mockResolvedValue({ affected: 1 });

            await service.revoke('token');

            const [criteria] = sessionRepo.update!.mock.calls[0] as [Record<string, unknown>];
            // `revokedAt: undefined` is dropped from a TypeORM where clause, which would turn this
            // into "any row with this hash" — the bug that made logout answer 200 and revoke
            // nothing. `IsNull()` is the whole point.
            expect(criteria.revokedAt).toEqual(IsNull());
            expect(criteria.tokenHash).toBe(SessionService.hash('token'));
        });

        it('is idempotent: an unknown token is not an error', async () => {
            sessionRepo.update!.mockResolvedValue({ affected: 0 });

            await expect(service.revoke('nu-exista')).resolves.toBeUndefined();
        });
    });

    describe('revokeAllForUser', () => {
        it('touches only that user, and only live sessions', async () => {
            sessionRepo.update!.mockResolvedValue({ affected: 3 });

            await service.revokeAllForUser(7);

            const [criteria] = sessionRepo.update!.mock.calls[0] as [Record<string, unknown>];
            expect(criteria).toMatchObject({ user: { id: 7 }, revokedAt: IsNull() });
        });
    });

    describe('revokeFamily', () => {
        it('sweeps every live token of one chain', async () => {
            sessionRepo.update!.mockResolvedValue({ affected: 2 });

            await service.revokeFamily('family-1');

            const [criteria] = sessionRepo.update!.mock.calls[0] as [Record<string, unknown>];
            expect(criteria).toMatchObject({ familyId: 'family-1', revokedAt: IsNull() });
        });
    });

    describe('listActive', () => {
        it('asks only for live, unexpired sessions of that user', async () => {
            sessionRepo.find!.mockResolvedValue([]);

            await service.listActive(4);

            const [options] = sessionRepo.find!.mock.calls[0] as [{ where: Record<string, unknown>; order: unknown }];
            expect(options.where).toMatchObject({ user: { id: 4 }, revokedAt: IsNull() });
            expect(options.where.expiresAt).toEqual(MoreThan(expect.any(Date) as unknown as Date));
            expect(options.order).toEqual({ createdAt: 'DESC' });
        });

        it('never returns the token hash', async () => {
            sessionRepo.find!.mockResolvedValue([
                {
                    id: 1,
                    createdAt: new Date(),
                    expiresAt: new Date(),
                    userAgent: 'curl',
                    tokenHash: 'nu-trebuie-sa-iasa',
                    familyId: 'f',
                    revokedAt: null,
                },
            ]);

            const sessions = await service.listActive(4);

            expect(Object.keys(sessions[0]).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'userAgent']);
            expect(JSON.stringify(sessions)).not.toContain('nu-trebuie-sa-iasa');
        });
    });

    describe('purgeExpired', () => {
        it('deletes only rows that can no longer be presented', async () => {
            sessionRepo.delete!.mockResolvedValue({ affected: 5 });

            await expect(service.purgeExpired()).resolves.toBe(5);

            const [criteria] = sessionRepo.delete!.mock.calls[0] as [Record<string, unknown>];
            expect(criteria.expiresAt).toEqual(LessThan(expect.any(Date) as unknown as Date));
        });

        it('reports zero rather than undefined when there was nothing to remove', async () => {
            sessionRepo.delete!.mockResolvedValue({ affected: undefined });

            await expect(service.purgeExpired()).resolves.toBe(0);
        });
    });

    describe('rotate', () => {
        /** A manager standing in for the one `dataSource.transaction` hands the callback. */
        function fakeTransaction(row: Record<string, unknown> | undefined) {
            const manager = {
                query: jest.fn().mockResolvedValue(row ? [row] : []),
                update: jest.fn().mockResolvedValue({ affected: 1 }),
                create: jest.fn((_entity: unknown, data: unknown) => data),
                save: jest.fn((data: unknown) => Promise.resolve(data)),
            };
            dataSource.transaction.mockImplementation((cb: (m: typeof manager) => unknown) => cb(manager));
            return manager;
        }

        const liveRow = {
            id: 1,
            familyId: 'family-1',
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
            userAgent: 'curl',
            user_id: 9,
        };

        it('takes a row lock before deciding anything', async () => {
            const manager = fakeTransaction(liveRow);

            await service.rotate('vechi', 'nou', new Date(Date.now() + 60_000));

            const [sql] = manager.query.mock.calls[0] as [string];
            // Without FOR UPDATE two concurrent refreshes both read `revokedAt IS NULL` and the
            // family mechanism stops detecting anything.
            expect(sql).toContain('FOR UPDATE');
        });

        it('consumes the presented token and issues a successor in the same family', async () => {
            const manager = fakeTransaction(liveRow);

            const successor = (await service.rotate('vechi', 'nou', new Date(Date.now() + 60_000))) as unknown as Record<string, unknown>;

            expect(manager.update).toHaveBeenCalledWith(Session, { id: 1 }, { revokedAt: expect.any(Date) });
            expect(successor.familyId).toBe('family-1');
            expect(successor.tokenHash).toBe(SessionService.hash('nou'));
            expect(successor.revokedAt).toBeNull();
        });

        it('rejects a token it has never seen', async () => {
            fakeTransaction(undefined);

            await expect(service.rotate('necunoscut', 'nou', new Date())).rejects.toThrow('Invalid refresh token');
        });

        it('rejects an expired token without revoking the chain', async () => {
            fakeTransaction({ ...liveRow, expiresAt: new Date(Date.now() - 1000) });

            await expect(service.rotate('vechi', 'nou', new Date())).rejects.toThrow('expired');
            // An expiry is not a theft signal, so nothing else in the family is touched.
            expect(sessionRepo.update).not.toHaveBeenCalled();
        });

        it('sweeps the family outside the transaction when a consumed token is replayed', async () => {
            fakeTransaction({ ...liveRow, revokedAt: new Date() });
            sessionRepo.update!.mockResolvedValue({ affected: 1 });

            await expect(service.rotate('vechi', 'nou', new Date(Date.now() + 60_000))).rejects.toThrow('already been used');

            // Through the repository, not the transaction's manager: done inside, the 401 that
            // follows would roll the revocation back and the stolen chain would stay live.
            const [criteria] = sessionRepo.update!.mock.calls[0] as [Record<string, unknown>];
            expect(criteria).toMatchObject({ familyId: 'family-1', revokedAt: IsNull() });
        });
    });

    describe('scheduling', () => {
        it('purges once at startup, not only after a day', () => {
            sessionRepo.delete!.mockResolvedValue({ affected: 0 });

            service.onModuleInit();

            // Without this the timer was the only trigger, so a process restarted more often than
            // every 24 hours — a deploy a day, which is the plan — never purged at all.
            expect(sessionRepo.delete).toHaveBeenCalledTimes(1);
        });

        it('does not hold the process open', () => {
            sessionRepo.delete!.mockResolvedValue({ affected: 0 });

            service.onModuleInit();

            // `unref()`ed, otherwise the test suite and a graceful shutdown would both hang.
            const timer = (service as unknown as { purgeTimer?: NodeJS.Timeout }).purgeTimer;
            expect(timer).toBeDefined();
            expect(timer?.hasRef()).toBe(false);
        });
    });
});
