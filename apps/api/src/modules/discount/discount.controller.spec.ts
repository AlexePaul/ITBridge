import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { buildController } from 'src/testing/controller.spec-helpers';

describe('DiscountController', () => {
    const build = () =>
        buildController(DiscountController, DiscountService, {
            createDiscount: jest.fn().mockResolvedValue({ id: 1 }),
            findDiscounts: jest.fn().mockResolvedValue([]),
            updateDiscount: jest.fn().mockResolvedValue({ id: 1 }),
            deleteDiscount: jest.fn().mockResolvedValue(undefined),
        });

    it('trece DTO-ul de creare către service', async () => {
        const { controller, service } = await build();
        const dto = { name: 'Frate', value: 50, monthIssued: '2026-03', parentId: 7 };
        await controller.createDiscount(dto);
        expect(service.createDiscount).toHaveBeenCalledWith(dto);
    });

    it('trece id-ul și body-ul către update', async () => {
        const { controller, service } = await build();
        await controller.updateDiscount(7, { value: 75 });
        expect(service.updateDiscount).toHaveBeenCalledWith(7, { value: 75 });
    });
});
