import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupService } from './group.service';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('GroupService', () => {
    let service: GroupService;
    let groupRepo: MockRepository;
    let roomRepo: MockRepository;

    const room = { id: 1, name: 'Sala 1', capacity: 10, isActive: true, location: { id: 1, name: 'Drumul Taberei', isActive: true } };
    const dto = { name: 'Scratch Începători', weekday: 2 as const, startTime: '17:00', endTime: '18:30', roomId: 1, capacity: 10, minAge: 7, maxAge: 10 };

    beforeEach(async () => {
        groupRepo = createMockRepository();
        roomRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [GroupService, provideMockRepository(Group, groupRepo), provideMockRepository(Room, roomRepo)],
        }).compile();
        service = module.get(GroupService);

        roomRepo.findOne!.mockResolvedValue(room);
        groupRepo.findOne!.mockResolvedValue(null);
        groupRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
        groupRepo.save!.mockImplementation((g: unknown) => Promise.resolve(g));
    });

    it('creates the group as active by default, in the room it was given', async () => {
        const created = await service.createGroup(dto);

        expect(created.isActive).toBe(true);
        expect(created.room).toBe(room);
        // The foreign key travels on the relation, not as a stray column of its own.
        expect(created).not.toHaveProperty('roomId');
    });

    it('rejects a room that does not exist', async () => {
        roomRepo.findOne!.mockResolvedValue(null);
        await expect(service.createGroup(dto)).rejects.toThrow(NotFoundException);
        expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a group that would admit more children than the room holds', async () => {
        await expect(service.createGroup({ ...dto, capacity: 11 })).rejects.toThrow(ConflictException);
        expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a second group in the same room at the same time', async () => {
        groupRepo.findOne!.mockResolvedValue({ id: 9, name: 'Python Începători', room });

        await expect(service.createGroup(dto)).rejects.toThrow(ConflictException);
        expect(groupRepo.save).not.toHaveBeenCalled();
    });

    // The point of E08/S2. The old constraint was on weekday plus start time alone, so this was
    // rejected school-wide — which is impossible for a school teaching at two addresses.
    it('allows the same weekday and time in a different room', async () => {
        const otherRoom = { id: 2, name: 'Sala 1', capacity: 10, isActive: true, location: { id: 2, name: 'Străulești', isActive: true } };
        roomRepo.findOne!.mockResolvedValue(otherRoom);

        const created = await service.createGroup({ ...dto, roomId: 2, name: 'Roblox Începători' });

        expect(created.room).toBe(otherRoom);
        // The collision check has to be asked about *that* room, or it answers a different question.
        expect(groupRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ room: { id: 2 } }) }));
    });

    it('refuses to schedule a group into a closed room', async () => {
        roomRepo.findOne!.mockResolvedValue({ ...room, isActive: false });
        await expect(service.createGroup(dto)).rejects.toThrow(ConflictException);
        expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to schedule a group at a closed location, even in an open room', async () => {
        roomRepo.findOne!.mockResolvedValue({ ...room, location: { ...room.location, isActive: false } });
        await expect(service.createGroup(dto)).rejects.toThrow(ConflictException);
    });

    it('compares start times in the stored form, so HH:MM and HH:MM:SS collide', async () => {
        await service.createGroup(dto);

        expect(groupRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ startTime: '17:00:00' }) }));
    });

    it('getGroupById also loads the group members, the room and its location', async () => {
        const qb = createMockQueryBuilder({ one: { id: 1 } });
        groupRepo.createQueryBuilder!.mockReturnValue(qb);

        await service.getGroupById(1);

        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('group.children', 'children');
        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('group.room', 'room');
        expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('room.location', 'location');
    });

    it('getGroups brings the room and location along, so a list can be filtered by location', async () => {
        groupRepo.find!.mockResolvedValue([]);

        await service.getGroups();

        expect(groupRepo.find).toHaveBeenCalledWith(expect.objectContaining({ relations: { room: { location: true } } }));
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

    it('updateGroup leaves the slot check alone when nothing about the slot changed', async () => {
        groupRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { id: 1, weekday: 2, startTime: '17:00:00', capacity: 10, room } }));

        await service.updateGroup(1, { name: 'Scratch Avansați' });

        expect(groupRepo.findOne).not.toHaveBeenCalled();
    });

    it('updateGroup checks the slot it is moving into, not the one it is leaving', async () => {
        groupRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { id: 1, weekday: 2, startTime: '17:00:00', capacity: 10, room } }));

        await service.updateGroup(1, { weekday: 3 });

        expect(groupRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ weekday: 3 }) }));
    });

    // A room closed after the fact must not freeze the groups already in it: renaming one, or
    // moving it out, is exactly what an admin does next.
    it('still allows editing a group that sits in a room which has since closed', async () => {
        const closed = { ...room, isActive: false };
        groupRepo.createQueryBuilder!.mockReturnValue(
            createMockQueryBuilder({ one: { id: 1, weekday: 2, startTime: '17:00:00', capacity: 10, room: closed } }),
        );

        await expect(service.updateGroup(1, { name: 'Scratch Avansați' })).resolves.toBeDefined();
    });

    it('refuses to move a group into a closed room', async () => {
        groupRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { id: 1, weekday: 2, startTime: '17:00:00', capacity: 10, room } }));
        roomRepo.findOne!.mockResolvedValue({ id: 2, name: 'Sala 2', capacity: 10, isActive: false, location: room.location });

        await expect(service.updateGroup(1, { roomId: 2 })).rejects.toThrow(ConflictException);
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
