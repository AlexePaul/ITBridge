import { UserController } from './user.controller';
import { UserService } from './user.service';
import { AccountApprovalService } from './account-approval.service';
import { buildController } from 'src/testing/controller.spec-helpers';

describe('UserController', () => {
    const approvals = {
        listPending: jest.fn().mockResolvedValue([]),
        approve: jest.fn().mockResolvedValue({ message: 'Cont aprobat' }),
        reject: jest.fn().mockResolvedValue({ message: 'Cont respins' }),
    };

    const build = () =>
        buildController(
            UserController,
            UserService,
            {
                getAllUsers: jest.fn().mockResolvedValue([]),
                getUsersWithoutProfile: jest.fn().mockResolvedValue([]),
                getUserById: jest.fn().mockResolvedValue({ id: 1 }),
                updateUser: jest.fn().mockResolvedValue({ id: 1 }),
                deleteUser: jest.fn().mockResolvedValue(undefined),
            },
            [{ provide: AccountApprovalService, useValue: approvals }],
        );

    beforeEach(() => {
        for (const fn of Object.values(approvals)) fn.mockClear();
    });

    it('delegates listing to the service', async () => {
        const { controller, service } = await build();
        await expect(controller.getAllUsers()).resolves.toEqual([]);
        expect(service.getAllUsers).toHaveBeenCalled();
    });

    it('exposes the flow for linking accounts that have no profile yet', async () => {
        const { controller, service } = await build();
        await controller.getUsersWithoutProfile();
        expect(service.getUsersWithoutProfile).toHaveBeenCalled();
    });

    it('passes the route id to the service', async () => {
        const { controller, service } = await build();
        await controller.getUserById(7);
        expect(service.getUserById).toHaveBeenCalledWith(7);
    });

    it('passes the id and body to update', async () => {
        const { controller, service } = await build();
        await controller.updateUser(7, { username: 'ana' });
        expect(service.updateUser).toHaveBeenCalledWith(7, { username: 'ana' });
    });

    it('serves the approvals queue from the approval service', async () => {
        const { controller } = await build();
        await controller.getPendingAccounts();
        expect(approvals.listPending).toHaveBeenCalled();
    });

    it('passes the route id to approve', async () => {
        const { controller } = await build();
        await controller.approveAccount(7);
        expect(approvals.approve).toHaveBeenCalledWith(7);
    });

    it('passes the reason through to reject, and undefined when there is none', async () => {
        const { controller } = await build();
        await controller.rejectAccount(7, { reason: 'duplicat' });
        expect(approvals.reject).toHaveBeenCalledWith(7, 'duplicat');

        await controller.rejectAccount(8, {});
        expect(approvals.reject).toHaveBeenCalledWith(8, undefined);
    });
});
