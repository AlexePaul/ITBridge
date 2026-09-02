import { Test, TestingModule } from '@nestjs/testing';
import { OccupancyReportService } from './occupancy-report.service';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { LOST_REVENUE_PER_SEAT_MONTHLY, OCCUPANCY_THRESHOLD } from './reports.rules';

/**
 * Seats against capacity — E21/S4.
 *
 * "Taken" is stubbed, because it is not this service's to define: it comes from
 * `EnrollmentService.occupancyOf`, trials included. What is tested is that the service asks, and
 * what it does with the answer — the roll-ups, the threshold, the estimate, the dead hours.
 */
describe('OccupancyReportService', () => {
    let service: OccupancyReportService;
    let groupRepo: MockRepository;
    let roomRepo: MockRepository;
    let enrollments: { occupancyOf: jest.Mock };

    const drumul = { id: 1, name: 'Drumul Taberei' };
    const militari = { id: 2, name: 'Militari' };
    const room1 = { id: 11, name: 'Sala 1', capacity: 10, isActive: true, location: drumul };
    const room2 = { id: 21, name: 'Sala 1', capacity: 12, isActive: true, location: militari };

    const group = (id: number, name: string, room: typeof room1, weekday: number, startTime: string, endTime: string) =>
        ({ id, name, weekday, startTime, endTime, room, capacity: 10, isActive: true }) as unknown as Group;

    beforeEach(async () => {
        groupRepo = createMockRepository();
        roomRepo = createMockRepository();
        enrollments = { occupancyOf: jest.fn() };
        groupRepo.find!.mockResolvedValue([]);
        roomRepo.find!.mockResolvedValue([]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OccupancyReportService,
                provideMockRepository(Group, groupRepo),
                provideMockRepository(Room, roomRepo),
                { provide: EnrollmentService, useValue: enrollments },
            ],
        }).compile();
        service = module.get(OccupancyReportService);
    });

    it('asks the enrolments for every active group, with the location loaded', async () => {
        groupRepo.find!.mockResolvedValue([group(1, 'Scratch', room1, 1, '16:00:00', '17:30:00')]);
        enrollments.occupancyOf.mockResolvedValue({ groupId: 1, capacity: 10, taken: 4, free: 6, waiting: 1 });

        await service.build();

        expect(groupRepo.find).toHaveBeenCalledWith({ where: { isActive: true }, relations: { room: { location: true } } });
        expect(enrollments.occupancyOf).toHaveBeenCalledWith(1);
    });

    it('flags a group under the threshold and prices its empty seats at list price', async () => {
        groupRepo.find!.mockResolvedValue([group(1, 'Scratch', room1, 1, '16:00:00', '17:30:00'), group(2, 'Python', room1, 2, '16:00:00', '17:30:00')]);
        roomRepo.find!.mockResolvedValue([room1]);
        enrollments.occupancyOf.mockImplementation((groupId: number) =>
            Promise.resolve(
                groupId === 1 ? { groupId, capacity: 10, taken: 4, free: 6, waiting: 0 } : { groupId, capacity: 10, taken: 9, free: 1, waiting: 2 },
            ),
        );

        const report = await service.build(new Date(2026, 8, 2));

        expect(report.threshold).toBe(OCCUPANCY_THRESHOLD);
        expect(report.ratePerSeat).toBe(LOST_REVENUE_PER_SEAT_MONTHLY);
        // Least full first.
        expect(report.groups.map((row) => row.name)).toEqual(['Scratch', 'Python']);
        expect(report.groups[0]).toMatchObject({ fillRate: 0.4, underThreshold: true, lostRevenueMonthly: 2100, locationName: 'Drumul Taberei' });
        expect(report.groups[1]).toMatchObject({ fillRate: 0.9, underThreshold: false, lostRevenueMonthly: 350, waiting: 2 });
        expect(report.totals).toMatchObject({
            groups: 2,
            capacity: 20,
            taken: 13,
            free: 7,
            waiting: 2,
            fillRate: 0.65,
            underThreshold: 1,
            lostRevenueMonthly: 2450,
        });
        expect(report.generatedOn).toBe('2026-09-02');
    });

    it('rolls seats up by room and by address', async () => {
        groupRepo.find!.mockResolvedValue([group(1, 'Scratch', room1, 1, '16:00:00', '17:30:00'), group(2, 'Python', room2, 1, '16:00:00', '17:30:00')]);
        roomRepo.find!.mockResolvedValue([room1, room2]);
        enrollments.occupancyOf.mockImplementation((groupId: number) =>
            Promise.resolve(
                groupId === 1 ? { groupId, capacity: 10, taken: 10, free: 0, waiting: 3 } : { groupId, capacity: 10, taken: 2, free: 8, waiting: 0 },
            ),
        );

        const report = await service.build();

        expect(report.rooms).toHaveLength(2);
        expect(report.rooms.find((room) => room.roomId === 11)).toMatchObject({ groups: 1, capacity: 10, taken: 10, free: 0, fillRate: 1, roomCapacity: 10 });
        expect(report.rooms.find((room) => room.roomId === 21)).toMatchObject({ groups: 1, taken: 2, free: 8, fillRate: 0.2, roomCapacity: 12 });

        expect(report.locations.map((row) => row.name)).toEqual(['Drumul Taberei', 'Militari']);
        expect(report.locations[0]).toMatchObject({ rooms: 1, groups: 1, taken: 10, free: 0, waiting: 3, fillRate: 1, lostRevenueMonthly: 0 });
        expect(report.locations[1]).toMatchObject({ rooms: 1, groups: 1, taken: 2, free: 8, fillRate: 0.2, lostRevenueMonthly: 2800 });
    });

    it('reports as dead the hours another room teaches in, and nothing else', async () => {
        const monday = { weekday: 1, startTime: '16:00:00', endTime: '17:30:00' };
        const tuesday = { weekday: 2, startTime: '16:00:00', endTime: '17:30:00' };
        groupRepo.find!.mockResolvedValue([
            group(1, 'Scratch', room1, 1, '16:00:00', '17:30:00'),
            group(2, 'Python', room2, 1, '16:00:00', '17:30:00'),
            group(3, 'Web', room2, 2, '16:00:00', '17:30:00'),
        ]);
        roomRepo.find!.mockResolvedValue([room1, room2]);
        enrollments.occupancyOf.mockResolvedValue({ groupId: 0, capacity: 10, taken: 5, free: 5, waiting: 0 });

        const report = await service.build();

        expect(report.totals.slotsInUse).toEqual([monday, tuesday]);
        // Room 1 teaches Monday only; the school also teaches Tuesday at that hour, so Tuesday is dead there.
        expect(report.rooms.find((room) => room.roomId === 11)!.deadSlots).toEqual([tuesday]);
        // Room 2 covers every hour the school uses.
        expect(report.rooms.find((room) => room.roomId === 21)!.deadSlots).toEqual([]);
    });

    it('lists an active room with no groups as empty in every hour the school teaches', async () => {
        groupRepo.find!.mockResolvedValue([group(1, 'Scratch', room1, 1, '16:00:00', '17:30:00')]);
        roomRepo.find!.mockResolvedValue([room1, room2]);
        enrollments.occupancyOf.mockResolvedValue({ groupId: 1, capacity: 10, taken: 5, free: 5, waiting: 0 });

        const report = await service.build();

        const idle = report.rooms.find((room) => room.roomId === 21)!;
        expect(idle).toMatchObject({ groups: 0, capacity: 0, taken: 0, fillRate: 0 });
        expect(idle.deadSlots).toEqual([{ weekday: 1, startTime: '16:00:00', endTime: '17:30:00' }]);
        // The address still appears in the roll-up, with nothing in it.
        expect(report.locations.find((row) => row.locationId === 2)).toMatchObject({ rooms: 1, groups: 0, capacity: 0 });
    });

    /**
     * A room can be deactivated while a group still runs in it — `isActive` blocks new groups, not
     * existing ones. The room drops out of the room list, but its group's seats must still roll up
     * to the address, or the per-address rows stop adding up to the totals.
     */
    it('keeps an address whose only active group sits in a deactivated room', async () => {
        groupRepo.find!.mockResolvedValue([group(1, 'Scratch', room1, 1, '16:00:00', '17:30:00'), group(2, 'Python', room2, 2, '16:00:00', '17:30:00')]);
        roomRepo.find!.mockResolvedValue([room1]); // room2 is inactive, so the repository does not return it
        enrollments.occupancyOf.mockResolvedValue({ groupId: 0, capacity: 10, taken: 4, free: 6, waiting: 0 });

        const report = await service.build();

        expect(report.rooms.map((room) => room.roomId)).toEqual([11]);
        expect(report.locations.find((row) => row.locationId === 2)).toMatchObject({ rooms: 0, groups: 1, capacity: 10, taken: 4 });
        expect(report.locations.reduce((sum, row) => sum + row.taken, 0)).toBe(report.totals.taken);
    });
});
