import { Test, TestingModule } from '@nestjs/testing';
import { AuditLog } from 'src/entities/audit-log.entity';
import { AuditAction } from 'src/enum/audit-action.enum';
import { createMockQueryBuilder, createMockRepository, MockQueryBuilder, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { AuditService } from './audit.service';

describe('AuditService', () => {
    let service: AuditService;
    let repo: MockRepository;
    let qb: MockQueryBuilder<AuditLog>;

    const ACTOR = { userId: 7, username: 'admin' };

    beforeEach(async () => {
        repo = createMockRepository();
        repo.insert = jest.fn().mockResolvedValue({});
        qb = createMockQueryBuilder<AuditLog>({ many: [] });
        repo.createQueryBuilder!.mockReturnValue(qb);

        const module: TestingModule = await Test.createTestingModule({
            providers: [AuditService, provideMockRepository(AuditLog, repo)],
        }).compile();

        service = module.get(AuditService);
    });

    describe('record', () => {
        it('stores the actor by id and by name, so the entry survives the account', async () => {
            await service.record({ actor: ACTOR, action: AuditAction.CREATED, entityType: 'Payment', entityId: 11 });

            expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 7, actorUsername: 'admin', entityType: 'Payment', entityId: 11 }));
        });

        it('accepts an actor with no user, for the work nobody pressed', async () => {
            await service.record({ actor: { userId: null, username: null }, action: AuditAction.UPDATED, entityType: 'Invoice', entityId: 412 });

            expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: null, actorUsername: null }));
        });

        /**
         * The whole reason the method takes a manager: the row has to share the fate of the change
         * it describes. Written on the service's own connection it would outlive a rollback, which
         * is a log that says something happened that did not.
         */
        it("writes through the caller's transaction when given one", async () => {
            const managerRepo = { insert: jest.fn().mockResolvedValue({}) };
            const manager = { getRepository: jest.fn().mockReturnValue(managerRepo) };

            await service.record({ actor: ACTOR, action: AuditAction.DELETED, entityType: 'Payment', entityId: 11 }, manager as never);

            expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
            expect(managerRepo.insert).toHaveBeenCalled();
            expect(repo.insert).not.toHaveBeenCalled();
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
            await service.recordUpdate({ ...params, before: { amount: 350, notes: 'x' }, after: { amount: 150, notes: 'x' } });

            expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ action: AuditAction.UPDATED, changes: { amount: { from: 350, to: 150 } } }));
        });

        // A save that set every field to what it already held is not an event, and a log full of
        // those is a log nobody reads — the failure this story exists to avoid, by another road.
        it('writes nothing when nothing moved', async () => {
            await service.recordUpdate({ ...params, before: { amount: 350, notes: 'x' }, after: { amount: 350, notes: 'x' } });

            expect(repo.insert).not.toHaveBeenCalled();
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
