import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { buildController } from 'src/testing/controller.spec-helpers';

describe('GroupController', () => {
    const build = () =>
        buildController(GroupController, GroupService, {
            createGroup: jest.fn().mockResolvedValue({ id: 1 }),
            getGroups: jest.fn().mockResolvedValue([]),
            getGroupById: jest.fn().mockResolvedValue({ id: 1 }),
            updateGroup: jest.fn().mockResolvedValue({ id: 1 }),
            deleteGroup: jest.fn().mockResolvedValue(undefined),
        });

    it('passes the create DTO to the service', async () => {
        const { controller, service } = await build();
        const dto = { name: 'Scratch Începători', weekday: 1, startTime: '09:00', endTime: '10:30', roomId: 1, capacity: 10, minAge: 7, maxAge: 10 };
        await controller.createGroup(dto);
        expect(service.createGroup).toHaveBeenCalledWith(dto);
    });

    it('passes the route id to getGroupById', async () => {
        const { controller, service } = await build();
        await controller.getGroupById(7);
        expect(service.getGroupById).toHaveBeenCalledWith(7);
    });

    it('passes the id and body to update', async () => {
        const { controller, service } = await build();
        await controller.updateGroup(7, { weekday: 3 });
        expect(service.updateGroup).toHaveBeenCalledWith(7, { weekday: 3 });
    });
});
