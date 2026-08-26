import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { Discount } from 'src/entities/discount.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('DiscountService', () => {
    let service: DiscountService;
    let discountRepo: MockRepository;

    beforeEach(async () => {
        discountRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [DiscountService, provideMockRepository(Discount, discountRepo)],
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
