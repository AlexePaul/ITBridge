import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('PaymentController', () => {
    const build = () =>
        buildController(PaymentController, PaymentService, {
            createPayment: jest.fn().mockResolvedValue({ id: 1 }),
            findPayments: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ id: 1 }),
            updatePayment: jest.fn().mockResolvedValue({ id: 1 }),
            deletePayment: jest.fn().mockResolvedValue({ message: 'ok' }),
        });

    it('passes the role and user id to findPayments', async () => {
        const { controller, service } = await build();
        await controller.findPayments({}, requestOf(Role.PARENT, 42));
        expect(service.findPayments).toHaveBeenCalledWith({}, Role.PARENT, 42);
    });

    it('passes the role and user id to findOne', async () => {
        const { controller, service } = await build();
        await controller.findOne(7, requestOf(Role.ADMIN, 1));
        expect(service.findOne).toHaveBeenCalledWith(7, Role.ADMIN, 1);
    });
});
