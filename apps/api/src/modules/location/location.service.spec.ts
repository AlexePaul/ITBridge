import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Not } from 'typeorm';
import { LocationService } from './location.service';
import { Location } from 'src/entities/location.entity';
import { Room } from 'src/entities/room.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('LocationService', () => {
    let service: LocationService;
    let locationRepo: MockRepository;
    let roomRepo: MockRepository;

    const dto = {
        name: 'Drumul Taberei',
        slug: 'drumul-taberei',
        street: 'Strada Valea Oltului 73',
        city: 'București',
        latitude: 44.415847,
        longitude: 26.013556,
    };

    beforeEach(async () => {
        locationRepo = createMockRepository();
        roomRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [LocationService, provideMockRepository(Location, locationRepo), provideMockRepository(Room, roomRepo)],
        }).compile();
        service = module.get(LocationService);

        locationRepo.findOne!.mockResolvedValue(null);
        locationRepo.create!.mockImplementation((d: unknown) => ({ ...(d as object) }));
        locationRepo.save!.mockImplementation((l: unknown) => Promise.resolve(l));
        roomRepo.count!.mockResolvedValue(0);
    });

    it('creates a location', async () => {
        const created = await service.createLocation(dto);
        expect(created.slug).toBe('drumul-taberei');
    });

    it('rejects a slug that is already taken', async () => {
        locationRepo.findOne!.mockResolvedValue({ id: 2, slug: 'drumul-taberei' });
        await expect(service.createLocation(dto)).rejects.toThrow(ConflictException);
        expect(locationRepo.save).not.toHaveBeenCalled();
    });

    it('lists locations by name, because the list is a picker first', async () => {
        locationRepo.find!.mockResolvedValue([]);
        await service.findLocations();
        expect(locationRepo.find).toHaveBeenCalledWith({ order: { name: 'ASC' } });
    });

    it('rejects a location that does not exist', async () => {
        await expect(service.findLocationById(99)).rejects.toThrow(NotFoundException);
    });

    it('excludes the row being updated from its own slug check', async () => {
        // Without `Not(id)` a location renamed to anything but its own slug still collides with
        // itself, and no location can ever be edited twice.
        locationRepo.findOne!.mockResolvedValueOnce({ id: 1, slug: 'drumul-taberei' }).mockResolvedValueOnce(null);

        await service.updateLocation(1, { slug: 'valea-oltului' });

        expect(locationRepo.findOne).toHaveBeenLastCalledWith({ where: { slug: 'valea-oltului', id: Not(1) } });
    });

    it('does not re-check the slug when the update leaves it alone', async () => {
        locationRepo.findOne!.mockResolvedValueOnce({ id: 1, slug: 'drumul-taberei' });

        await service.updateLocation(1, { name: 'Drumul Taberei (Valea Oltului)' });

        expect(locationRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('refuses to delete a location that still has rooms', async () => {
        roomRepo.count!.mockResolvedValue(2);
        await expect(service.deleteLocation(1)).rejects.toThrow(ConflictException);
        expect(locationRepo.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting a location that does not exist', async () => {
        locationRepo.delete!.mockResolvedValue({ affected: 0 });
        await expect(service.deleteLocation(99)).rejects.toThrow(NotFoundException);
    });
});
