import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { PaymentFiscalService } from './payment-fiscal.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('PaymentController', () => {
    const fiscal = { status: jest.fn(), retry: jest.fn(), confirmRecorded: jest.fn() };

    const build = () =>
        buildController(
            PaymentController,
            PaymentService,
            {
                createPayment: jest.fn().mockResolvedValue({ id: 1 }),
                findPayments: jest.fn().mockResolvedValue([]),
                findOne: jest.fn().mockResolvedValue({ id: 1 }),
                updatePayment: jest.fn().mockResolvedValue({ id: 1 }),
                deletePayment: jest.fn().mockResolvedValue({ message: 'ok' }),
            },
            [{ provide: PaymentFiscalService, useValue: fiscal }],
        );

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

    // E16/S5: the two doors out of a refused or lost request are a person's, so they carry the actor.
    it('hands the SmartBill retry and confirmation to the queue with whoever pressed', async () => {
        const { controller } = await build();

        await controller.retryFiscal(7, requestOf(Role.ADMIN, 42));
        await controller.confirmFiscal(7, { number: '0007' }, requestOf(Role.ADMIN, 42));

        expect(fiscal.retry).toHaveBeenCalledWith(7, expect.objectContaining({ userId: 42 }));
        expect(fiscal.confirmRecorded).toHaveBeenCalledWith(7, '0007', expect.objectContaining({ userId: 42 }));
    });
});
