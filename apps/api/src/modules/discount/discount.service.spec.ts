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
 * The one-press referral reward — E20/S5.
 *
 * What is worth holding here is not that a row gets written; it is the refusal. Percentages add up
 * against the list price, so a second press would make the month free, and a free month is
 * indistinguishable from one somebody decided on.
 */
describe('DiscountService.grantReferralNextMonth', () => {
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

        profileRepo.findOne!.mockResolvedValue({ id: 7 });
        discountRepo.findOne!.mockResolvedValue(null);
        discountRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
        discountRepo.save!.mockImplementation((d: unknown) => Promise.resolve(d));
    });

    it('writes half off, on next month, against the family', async () => {
        const granted = await service.grantReferralNextMonth(7, new Date('2026-03-09T12:00:00Z'));

        expect(granted).toMatchObject({
            name: 'Recomandare',
            type: 'percent',
            value: 50,
            monthIssued: '2026-04',
            parent: { id: 7 },
        });
    });

    it('refuses a second percentage on the same month, rather than making it free', async () => {
        discountRepo.findOne!.mockResolvedValue({ id: 1, type: 'percent', value: 50, monthIssued: '2026-04' });

        await expect(service.grantReferralNextMonth(7, new Date('2026-03-09T12:00:00Z'))).rejects.toThrow(ConflictException);
        expect(discountRepo.save).not.toHaveBeenCalled();
    });

    it('looks for the clash on the month it is about to write, not on today', async () => {
        await service.grantReferralNextMonth(7, new Date('2026-12-31T12:00:00Z'));

        expect(discountRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ monthIssued: '2027-01' }) }));
    });

    it('refuses a family that does not exist, instead of leaving it to the foreign key', async () => {
        profileRepo.findOne!.mockResolvedValue(null);

        await expect(service.grantReferralNextMonth(99)).rejects.toThrow(NotFoundException);
        expect(discountRepo.save).not.toHaveBeenCalled();
    });
});
