import { UserController } from './user.controller';
import { UserService } from './user.service';
import { buildController } from 'src/testing/controller.spec-helpers';

describe('UserController', () => {
    const build = () =>
        buildController(UserController, UserService, {
            getAllUsers: jest.fn().mockResolvedValue([]),
            getUsersWithoutProfile: jest.fn().mockResolvedValue([]),
            getUserById: jest.fn().mockResolvedValue({ id: 1 }),
            updateUser: jest.fn().mockResolvedValue({ id: 1 }),
            deleteUser: jest.fn().mockResolvedValue(undefined),
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
});
