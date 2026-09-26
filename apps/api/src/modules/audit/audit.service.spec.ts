import { Test, TestingModule } from '@nestjs/testing';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AuditAction } from 'src/enum/audit-action.enum';
import { createMockQueryBuilder, createMockRepository, MockQueryBuilder, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { AuditService } from './audit.service';

describe('AuditService', () => {
    let service: AuditService;
    let repo: MockRepository;
    let qb: MockQueryBuilder<AuditLog>;
    /** The caller's transaction, and the only road a write may take — see `record`'s signature. */
    let managerRepo: { insert: jest.Mock };
    let manager: { getRepository: jest.Mock };

    const ACTOR = { userId: 7, username: 'admin' };

    beforeEach(async () => {
        repo = createMockRepository();
        repo.insert = jest.fn().mockResolvedValue({});
        managerRepo = { insert: jest.fn().mockResolvedValue({}) };
        manager = { getRepository: jest.fn().mockReturnValue(managerRepo) };
        qb = createMockQueryBuilder<AuditLog>({ many: [] });
        repo.createQueryBuilder!.mockReturnValue(qb);

        const module: TestingModule = await Test.createTestingModule({
            providers: [AuditService, provideMockRepository(AuditLog, repo)],
        }).compile();

        service = module.get(AuditService);
    });

    describe('record', () => {
        it('stores the actor by id and by name, so the entry survives the account', async () => {
            await service.record({ actor: ACTOR, action: AuditAction.CREATED, entityType: 'Payment', entityId: 11 }, manager as never);

            expect(managerRepo.insert).toHaveBeenCalledWith(
                expect.objectContaining({ actorUserId: 7, actorUsername: 'admin', entityType: 'Payment', entityId: 11 }),
            );
        });

        it('accepts an actor with no user, for the work nobody pressed', async () => {
            await service.record(
                { actor: { userId: null, username: null }, action: AuditAction.UPDATED, entityType: 'Invoice', entityId: 412 },
                manager as never,
            );

            expect(managerRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: null, actorUsername: null }));
        });

        /**
         * The whole reason the method demands a manager: the row has to share the fate of the change
         * it describes. Written on the service's own connection it would outlive a rollback, which
         * is a log that says something happened that did not — and it would be lost by a failure
         * after a change that stood, which is the same gap the other way round. The parameter is
         * required rather than offered because six writers had drifted into calling it without one.
         */
        it("writes through the caller's transaction and never on its own connection", async () => {
            await service.record({ actor: ACTOR, action: AuditAction.DELETED, entityType: 'Payment', entityId: 11 }, manager as never);

            expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
            expect(managerRepo.insert).toHaveBeenCalled();
            expect(repo.insert).not.toHaveBeenCalled();
        });
    });

    /**
     * The review of 25 September 2026. The bank reconciliation writes a transfer's own text into
     * the payment's note — "plata martie Maria Pop" — and the note was copied into the trail as a
     * value, where the family's erasure cannot reach and the entry outlives them by design.
     */
    describe('free text about a family', () => {
        it("keeps a payment note's name and not its words, while the figures stay", async () => {
            await service.record(
                {
                    actor: ACTOR,
                    action: AuditAction.CREATED,
                    entityType: 'Payment',
                    entityId: 57,
                    changes: {
                        amount: { from: null, to: 350 },
                        notes: { from: null, to: 'Din extrasul bancar, 2026-03-05: plata martie Maria Pop' },
                    },
                },
                manager as never,
            );

            expect(managerRepo.insert).toHaveBeenCalledWith(
                expect.objectContaining({ changes: { amount: { from: null, to: 350 }, notes: { from: null, to: null } } }),
            );
        });

        it('does the same for an override reason and a discount name, on every path in', async () => {
            await service.recordUpdate(
                {
                    actor: ACTOR,
                    entityType: 'SessionCountOverride',
                    entityId: 3,
                    before: { sessions: 4, reason: null },
                    after: { sessions: 3, reason: 'a fost bolnavă' },
                    fields: ['sessions', 'reason'],
                },
                manager as never,
            );
            await service.record(
                {
                    actor: ACTOR,
                    action: AuditAction.DELETED,
                    entityType: 'Discount',
                    entityId: 8,
                    changes: { name: { from: 'Reducere pentru Ioana', to: null }, value: { from: 50, to: null } },
                },
                manager as never,
            );

            expect(managerRepo.insert).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({ changes: { sessions: { from: 4, to: 3 }, reason: { from: null, to: null } } }),
            );
            expect(managerRepo.insert).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({ changes: { name: { from: null, to: null }, value: { from: 50, to: null } } }),
            );
        });
    });

    describe('recordUpdate', () => {
        const params = {
            actor: ACTOR,
            entityType: 'Payment',
            entityId: 11,
            fields: ['amount', 'notes'],
        };

        it('keeps only the fields that moved', async () => {
            await service.recordUpdate({ ...params, before: { amount: 350, notes: 'x' }, after: { amount: 150, notes: 'x' } }, manager as never);

            expect(managerRepo.insert).toHaveBeenCalledWith(
                expect.objectContaining({ action: AuditAction.UPDATED, changes: { amount: { from: 350, to: 150 } } }),
            );
        });

        // A save that set every field to what it already held is not an event, and a log full of
        // those is a log nobody reads — the failure this story exists to avoid, by another road.
        it('writes nothing when nothing moved', async () => {
            await service.recordUpdate({ ...params, before: { amount: 350, notes: 'x' }, after: { amount: 350, notes: 'x' } }, manager as never);

            expect(managerRepo.insert).not.toHaveBeenCalled();
        });
    });

    describe('find', () => {
        it('narrows by every filter it was given, and only with andWhere', async () => {
            await service.find({ entityType: 'Invoice', entityId: 412, actorUserId: 7 });

            const conditions = qb.andWhereCalls.map(([condition]) => condition);
            expect(conditions).toEqual([
                expect.stringContaining('audit.entityType'),
                expect.stringContaining('audit.entityId'),
                expect.stringContaining('audit.actorUserId'),
            ]);
            expect(qb.where).not.toHaveBeenCalled();
        });

        // `entityId=0` and `actorUserId=0` are not real ids, but a truthiness check here would be
        // the same mistake that makes `undefined` mean "ignore the condition" in a TypeORM where.
        it('does not drop a filter whose value is zero', async () => {
            await service.find({ entityId: 0, actorUserId: 0 });

            expect(qb.andWhereCalls).toHaveLength(2);
        });

        it('reads newest first, and caps an unbounded request', async () => {
            await service.find({});

            expect(qb.orderBy).toHaveBeenCalledWith('audit.occurredAt', 'DESC');
            expect(qb.take).toHaveBeenCalledWith(50);
        });

        it('honours a caller-supplied limit', async () => {
            await service.find({ limit: 200 });

            expect(qb.take).toHaveBeenCalledWith(200);
        });
    });
});
