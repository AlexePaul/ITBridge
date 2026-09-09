import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('DiscountController', () => {
    const build = () =>
        buildController(DiscountController, DiscountService, {
            createDiscount: jest.fn().mockResolvedValue({ id: 1 }),
            findDiscounts: jest.fn().mockResolvedValue([]),
            updateDiscount: jest.fn().mockResolvedValue({ id: 1 }),
            deleteDiscount: jest.fn().mockResolvedValue(undefined),
        });

    /** E07/S3. Who acted comes from the token, never from the body — see the actor test below. */
    const ADMIN = requestOf(Role.ADMIN, 42, 'ana');
    const ACTOR = { userId: 42, username: 'ana' };

    it('passes the create DTO to the service', async () => {
        const { controller, service } = await build();
        const dto = { name: 'Frate', value: 50, monthIssued: '2026-03', parentId: 7 };
        await controller.createDiscount(dto, ADMIN);
        expect(service.createDiscount).toHaveBeenCalledWith(dto, ACTOR);
    });

    it('passes the id and body to update', async () => {
        const { controller, service } = await build();
        await controller.updateDiscount(7, { value: 75 }, ADMIN);
        expect(service.updateDiscount).toHaveBeenCalledWith(7, { value: 75 }, ACTOR);
    });
});
