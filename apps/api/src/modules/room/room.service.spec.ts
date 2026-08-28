import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RoomService } from './room.service';
import { Group } from 'src/entities/group.entity';
import { Location } from 'src/entities/location.entity';
import { Room } from 'src/entities/room.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('RoomService', () => {
    let service: RoomService;
    let roomRepo: MockRepository;
    let locationRepo: MockRepository;
    let groupRepo: MockRepository;

    const location = { id: 1, name: 'Drumul Taberei', slug: 'drumul-taberei' };
    const dto = { name: 'Sala 1', locationId: 1, capacity: 10 };

    beforeEach(async () => {
        roomRepo = createMockRepository();
        locationRepo = createMockRepository();
        groupRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RoomService,
                provideMockRepository(Room, roomRepo),
                provideMockRepository(Location, locationRepo),
                provideMockRepository(Group, groupRepo),
            ],
        }).compile();
        service = module.get(RoomService);

        locationRepo.findOne!.mockResolvedValue(location);
        roomRepo.findOne!.mockResolvedValue(null);
        roomRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
        roomRepo.save!.mockImplementation((r: unknown) => Promise.resolve(r));
        groupRepo.count!.mockResolvedValue(0);
    });

    it('attaches the room to its location, without leaving a stray locationId behind', async () => {
        const created = await service.createRoom(dto);

        expect(created.location).toBe(location);
        expect(created).not.toHaveProperty('locationId');
    });

    it('rejects a location that does not exist', async () => {
        locationRepo.findOne!.mockResolvedValue(null);
        await expect(service.createRoom(dto)).rejects.toThrow(NotFoundException);
        expect(roomRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate room name within the same location', async () => {
        roomRepo.findOne!.mockResolvedValue({ id: 5, name: 'Sala 1' });
        await expect(service.createRoom(dto)).rejects.toThrow(ConflictException);
    });

    // "Sala 1" exists at both addresses in reality, so the name is only unique within a location.
    it('scopes the name check to the location', async () => {
        await service.createRoom(dto);

        expect(roomRepo.findOne).toHaveBeenCalledWith({ where: { name: 'Sala 1', location: { id: 1 } } });
    });

    it('lists every room when no location is given', async () => {
        roomRepo.find!.mockResolvedValue([]);
        await service.findRooms({});
        expect(roomRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('filters by location when one is given', async () => {
        roomRepo.find!.mockResolvedValue([]);
        await service.findRooms({ locationId: 2 });
        expect(roomRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { location: { id: 2 } } }));
    });

    it('checks the name against the location a room is moving to, not the one it is leaving', async () => {
        roomRepo.findOne!.mockResolvedValueOnce({ id: 1, name: 'Sala 1', capacity: 10, location });
        locationRepo.findOne!.mockResolvedValue({ id: 2, name: 'Străulești', slug: 'straulesti' });
        roomRepo.findOne!.mockResolvedValueOnce(null);

        await service.updateRoom(1, { locationId: 2 });

        expect(roomRepo.findOne).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ location: { id: 2 } }) }));
    });

    it('refuses to delete a room that still hosts groups', async () => {
        groupRepo.count!.mockResolvedValue(1);
        await expect(service.deleteRoom(1)).rejects.toThrow(ConflictException);
        expect(roomRepo.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting a room that does not exist', async () => {
        roomRepo.delete!.mockResolvedValue({ affected: 0 });
        await expect(service.deleteRoom(99)).rejects.toThrow(NotFoundException);
    });
});
