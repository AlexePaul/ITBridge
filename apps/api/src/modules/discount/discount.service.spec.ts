import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { Discount } from 'src/entities/discount.entity';
import { Profile } from 'src/entities/profile.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('DiscountService', () => {
    let service: DiscountService;
    let discountRepo: MockRepository;
    let profileRepo: MockRepository;

    beforeEach(async () => {
        discountRepo = createMockRepository();
        profileRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [DiscountService, provideMockRepository(Discount, discountRepo), provideMockRepository(Profile, profileRepo)],
        }).compile();
        service = module.get(DiscountService);
    });

    it('links the discount to the parent from the DTO', async () => {
        discountRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
        discountRepo.save!.mockImplementation((d: unknown) => Promise.resolve(d));

        const created = await service.createDiscount({ name: 'Frate', value: 50, monthIssued: '2026-03', parentId: 7 });

        expect(created).toMatchObject({ parent: { id: 7 } });
    });

    it('updateDiscount ignores undefined fields', async () => {
        discountRepo.findOne!.mockResolvedValue({ id: 1, name: 'Frate', value: 50 });
        discountRepo.save!.mockImplementation((d: unknown) => Promise.resolve(d));

        const updated = await service.updateDiscount(1, { value: 75, name: undefined });

        expect(updated).toMatchObject({ name: 'Frate', value: 75 });
    });

    it('updateDiscount rejects a discount that does not exist', async () => {
        discountRepo.findOne!.mockResolvedValue(null);
        await expect(service.updateDiscount(99, { value: 1 })).rejects.toThrow(NotFoundException);
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

    const march = new Date('2026-03-09T12:00:00Z');

    beforeEach(async () => {
        discountRepo = createMockRepository();
        profileRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [DiscountService, provideMockRepository(Discount, discountRepo), provideMockRepository(Profile, profileRepo)],
        }).compile();
        service = module.get(DiscountService);

        rows = [];
        profileRepo.findOne!.mockResolvedValue({ id: 7 });
        discountRepo.find!.mockImplementation(() => Promise.resolve(rows.filter((row) => row.name === 'Recomandare')));
        discountRepo.findOne!.mockImplementation((options: { where?: { monthIssued?: string } }) =>
            Promise.resolve(rows.find((row) => row.monthIssued === options?.where?.monthIssued) ?? null),
        );
        discountRepo.create!.mockImplementation((d: unknown) => ({ id: rows.length + 1, ...(d as object) }));
        discountRepo.save!.mockImplementation((d: { monthIssued: string }) => {
            rows.push(d as (typeof rows)[number]);
            return Promise.resolve(d);
        });
        discountRepo.delete!.mockImplementation((id: number) => {
            rows = rows.filter((row) => row.id !== id);
            return Promise.resolve({ affected: 1 });
        });
    });

    it('puts the first press on next month', async () => {
        const reward = await service.grantReferralMonth(7, march);

        expect(reward).toEqual({ parentId: 7, months: ['2026-04'] });
        expect(rows[0]).toMatchObject({ name: 'Recomandare', type: 'percent', value: 50, monthIssued: '2026-04' });
    });

    it('puts each further press on the month after the last, not on the same one twice', async () => {
        await service.grantReferralMonth(7, march);
        await service.grantReferralMonth(7, march);
        const reward = await service.grantReferralMonth(7, march);

        expect(reward.months).toEqual(['2026-04', '2026-05', '2026-06']);
        expect(rows.every((row) => row.value === 50)).toBe(true);
    });

    it('rolls the year over when the run runs past December', async () => {
        const november = new Date('2026-11-09T12:00:00Z');
        await service.grantReferralMonth(7, november);
        const reward = await service.grantReferralMonth(7, november);

        expect(reward.months).toEqual(['2026-12', '2027-01']);
    });

    it('takes the last month back on the way down, so the two presses undo each other', async () => {
        await service.grantReferralMonth(7, march);
        await service.grantReferralMonth(7, march);

        const reward = await service.revokeReferralMonth(7, march);

        expect(reward.months).toEqual(['2026-04']);
        expect(rows.map((row) => row.monthIssued)).toEqual(['2026-04']);
    });

    it('refuses to go below nothing', async () => {
        await expect(service.revokeReferralMonth(7, march)).rejects.toThrow(ConflictException);
    });

    it('refuses to stack on a percentage somebody else put on that month', async () => {
        rows.push({ id: 99, name: 'Fidelitate', type: 'percent', value: 50, monthIssued: '2026-04' });

        await expect(service.grantReferralMonth(7, march)).rejects.toThrow(ConflictException);
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

        await expect(service.grantReferralMonth(99, march)).rejects.toThrow(NotFoundException);
        expect(rows).toHaveLength(0);
    });
});
