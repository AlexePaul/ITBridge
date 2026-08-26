import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GroupService } from './group.service';
import { Group } from 'src/entities/group.entity';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('GroupService', () => {
    let service: GroupService;
    let groupRepo: MockRepository;

    beforeEach(async () => {
        groupRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [GroupService, provideMockRepository(Group, groupRepo)],
        }).compile();
        service = module.get(GroupService);
    });

    it('creates the group as active by default', async () => {
        groupRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
        groupRepo.save!.mockImplementation((g: unknown) => Promise.resolve(g));

        const created = await service.createGroup({ weekday: 1, startTime: '09:00', endTime: '10:30', minAge: 7, maxAge: 10 });

        expect(created.isActive).toBe(true);
    });

    it('getGroupById also loads the group members', async () => {
        const qb = createMockQueryBuilder({ one: { id: 1 } });
        groupRepo.createQueryBuilder!.mockReturnValue(qb);

        await service.getGroupById(1);

        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('group.children', 'children');
    });

    it('getGroupById rejects a group that does not exist', async () => {
        groupRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: null }));
        await expect(service.getGroupById(99)).rejects.toThrow(NotFoundException);
    });

    it('updateGroup rejects a non-existent group before saving', async () => {
        groupRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: null }));

        await expect(service.updateGroup(99, { weekday: 2 })).rejects.toThrow(NotFoundException);
        expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('deleteGroup rejects a group that does not exist', async () => {
        groupRepo.delete!.mockResolvedValue({ affected: 0 });
        await expect(service.deleteGroup(99)).rejects.toThrow(NotFoundException);
    });

    it('deleteGroup succeeds when something was deleted', async () => {
        groupRepo.delete!.mockResolvedValue({ affected: 1 });
        await expect(service.deleteGroup(1)).resolves.toBeUndefined();
    });
});
