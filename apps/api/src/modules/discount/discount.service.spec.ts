import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { Discount } from 'src/entities/discount.entity';
import { Profile } from 'src/entities/profile.entity';
import {
    createMockEntityManager,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';

/** Whoever pressed the button, in the shape `actorFrom` hands over. */
const ACTOR = { userId: 42, username: 'admin' };

describe('DiscountService', () => {
    let service: DiscountService;
    let discountRepo: MockRepository;
    let profileRepo: MockRepository;
    let manager: MockEntityManager;
    let audit: { record: jest.Mock; recordUpdate: jest.Mock };

    beforeEach(async () => {
        discountRepo = createMockRepository();
        profileRepo = createMockRepository();
        manager = createMockEntityManager();
        audit = { record: jest.fn(() => Promise.resolve()), recordUpdate: jest.fn(() => Promise.resolve()) };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DiscountService,
                provideMockRepository(Discount, discountRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockDataSource(manager),
                { provide: AuditService, useValue: audit },
            ],
        }).compile();
        service = module.get(DiscountService);
    });

    it('links the discount to the parent from the DTO', async () => {
        discountRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
        manager.save.mockImplementation((_entity: unknown, d: unknown) => Promise.resolve(d));

        const created = await service.createDiscount({ name: 'Frate', value: 50, monthIssued: '2026-03', parentId: 7 }, ACTOR);

        expect(created).toMatchObject({ parent: { id: 7 } });
    });

    it('updateDiscount ignores undefined fields', async () => {
        discountRepo.findOne!.mockResolvedValue({ id: 1, name: 'Frate', value: 50 });
        manager.save.mockImplementation((_entity: unknown, d: unknown) => Promise.resolve(d));

        const updated = await service.updateDiscount(1, { value: 75, name: undefined }, ACTOR);

        expect(updated).toMatchObject({ name: 'Frate', value: 75 });
    });

    it('updateDiscount rejects a discount that does not exist', async () => {
        discountRepo.findOne!.mockResolvedValue(null);
        await expect(service.updateDiscount(99, { value: 1 }, ACTOR)).rejects.toThrow(NotFoundException);
    });

    /**
     * E07/S3. A discount is money given away, so the four fields that decide how much go into the
     * trail — and the entry commits with the change, not beside it.
     */
    describe('audit trail', () => {
        it('records a new discount with the family it is for', async () => {
            discountRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
            manager.save.mockImplementation((_entity: unknown, d: object) => Promise.resolve({ id: 3, ...d }));

            await service.createDiscount({ name: 'Frate', value: 50, monthIssued: '2026-03', parentId: 7 }, ACTOR);

            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: ACTOR,
                    action: AuditAction.CREATED,
                    entityType: 'Discount',
                    entityId: 3,
                    changes: expect.objectContaining({ value: { from: null, to: 50 } }),
                    note: 'familia 7',
                }),
                manager,
            );
        });

        it('records an edit as the fields that moved', async () => {
            discountRepo.findOne!.mockResolvedValue({ id: 1, name: 'Frate', type: 'fixed', value: 50, monthIssued: '2026-03' });
            manager.save.mockImplementation((_entity: unknown, d: unknown) => Promise.resolve(d));

            const updated = await service.updateDiscount(1, { value: 75 }, ACTOR);

            expect(audit.recordUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    entityType: 'Discount',
                    entityId: 1,
                    before: expect.objectContaining({ value: 50 }),
                    after: expect.objectContaining({ value: 75 }),
                }),
                manager,
            );
            // The row the log reads is the row that goes back over the wire, and `Profile` carries
            // the family's email, phone and address. Loading it to decorate an entry would publish
            // all three to whoever pressed save.
            expect(discountRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
            expect(updated).not.toHaveProperty('parent');
        });

        it('keeps what a deleted discount held', async () => {
            discountRepo.findOne!.mockResolvedValue({ id: 1, name: 'Frate', type: 'fixed', value: 50, monthIssued: '2026-03', parent: { id: 7 } });

            await service.deleteDiscount(1, ACTOR);

            expect(manager.delete).toHaveBeenCalledWith(Discount, 1);
            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({ action: AuditAction.DELETED, entityId: 1, changes: expect.objectContaining({ value: { from: 50, to: null } }) }),
                manager,
            );
        });

        // `delete` on a missing id has always answered without complaint; an entry for it would
        // claim somebody withdrew a discount that never existed.
        it('records nothing when the discount was already gone', async () => {
            discountRepo.findOne!.mockResolvedValue(null);

            await service.deleteDiscount(99, ACTOR);

            expect(manager.delete).not.toHaveBeenCalled();
            expect(audit.record).not.toHaveBeenCalled();
        });
    });
});

/**
 * The referral reward as a bump in each direction — E20/S5.
 *
 * The property worth holding is that a second press buys a second **month**, never a deeper cut on
 * one month: percentages add up against the list price, so two on one month is a free month, and a
 * free month produced by a double-click is indistinguishable from one somebody decided on.
 */
describe('DiscountService referral reward', () => {
    let service: DiscountService;
    let discountRepo: MockRepository;
    let profileRepo: MockRepository;

    /** The rows the fake repository holds, so a grant and the next read agree with each other. */
    let rows: Array<{ id: number; name: string; type: string; value: number; monthIssued: string }>;
    let manager: MockEntityManager;
    let audit: { record: jest.Mock; recordUpdate: jest.Mock };

    const march = new Date('2026-03-09T12:00:00Z');

    beforeEach(async () => {
        discountRepo = createMockRepository();
        profileRepo = createMockRepository();
        manager = createMockEntityManager();
        audit = { record: jest.fn(() => Promise.resolve()), recordUpdate: jest.fn(() => Promise.resolve()) };
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DiscountService,
                provideMockRepository(Discount, discountRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockDataSource(manager),
                { provide: AuditService, useValue: audit },
            ],
        }).compile();
        service = module.get(DiscountService);

        rows = [];
        profileRepo.findOne!.mockResolvedValue({ id: 7 });
        discountRepo.find!.mockImplementation(() => Promise.resolve(rows.filter((row) => row.name === 'Recomandare')));
        discountRepo.findOne!.mockImplementation((options: { where?: { monthIssued?: string } }) =>
            Promise.resolve(rows.find((row) => row.monthIssued === options?.where?.monthIssued) ?? null),
        );
        discountRepo.create!.mockImplementation((d: unknown) => ({ id: rows.length + 1, ...(d as object) }));
        // The writes go through the transaction's manager now (E07/S3): the reward row and the
        // entry that records it have to commit together.
        manager.save.mockImplementation((_entity: unknown, d: { monthIssued: string }) => {
            rows.push(d as (typeof rows)[number]);
            return Promise.resolve(d);
        });
        manager.delete.mockImplementation((_entity: unknown, id: number) => {
            rows = rows.filter((row) => row.id !== id);
            return Promise.resolve({ affected: 1 });
        });
    });

    it('puts the first press on next month', async () => {
        const reward = await service.grantReferralMonth(7, ACTOR, march);

        expect(reward).toEqual({ parentId: 7, months: ['2026-04'] });
        expect(rows[0]).toMatchObject({ name: 'Recomandare', type: 'percent', value: 50, monthIssued: '2026-04' });
    });

    it('puts each further press on the month after the last, not on the same one twice', async () => {
        await service.grantReferralMonth(7, ACTOR, march);
        await service.grantReferralMonth(7, ACTOR, march);
        const reward = await service.grantReferralMonth(7, ACTOR, march);

        expect(reward.months).toEqual(['2026-04', '2026-05', '2026-06']);
        expect(rows.every((row) => row.value === 50)).toBe(true);
    });

    it('rolls the year over when the run runs past December', async () => {
        const november = new Date('2026-11-09T12:00:00Z');
        await service.grantReferralMonth(7, ACTOR, november);
        const reward = await service.grantReferralMonth(7, ACTOR, november);

        expect(reward.months).toEqual(['2026-12', '2027-01']);
    });

    it('takes the last month back on the way down, so the two presses undo each other', async () => {
        await service.grantReferralMonth(7, ACTOR, march);
        await service.grantReferralMonth(7, ACTOR, march);

        const reward = await service.revokeReferralMonth(7, ACTOR, march);

        expect(reward.months).toEqual(['2026-04']);
        expect(rows.map((row) => row.monthIssued)).toEqual(['2026-04']);
    });

    it('refuses to go below nothing', async () => {
        await expect(service.revokeReferralMonth(7, ACTOR, march)).rejects.toThrow(ConflictException);
    });

    it('refuses to stack on a percentage somebody else put on that month', async () => {
        rows.push({ id: 99, name: 'Fidelitate', type: 'percent', value: 50, monthIssued: '2026-04' });

        await expect(service.grantReferralMonth(7, ACTOR, march)).rejects.toThrow(ConflictException);
        expect(rows).toHaveLength(1);
    });

    it('reads back only the months from next month onwards', async () => {
        rows.push({ id: 1, name: 'Recomandare', type: 'percent', value: 50, monthIssued: '2026-01' });
        rows.push({ id: 2, name: 'Recomandare', type: 'percent', value: 50, monthIssued: '2026-04' });

        const reward = await service.referralReward(7, march);

        expect(reward.months).toEqual(['2026-04']);
    });

    it('refuses a family that does not exist, instead of leaving it to the foreign key', async () => {
        profileRepo.findOne!.mockResolvedValue(null);

        await expect(service.grantReferralMonth(99, ACTOR, march)).rejects.toThrow(NotFoundException);
        expect(rows).toHaveLength(0);
    });
});
