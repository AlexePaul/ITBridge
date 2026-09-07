import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RescheduleService } from './reschedule.service';
import { NonTeachingPeriodService } from './non-teaching-period.service';
import { ClassSessionNotifier } from './class-session-notifier';
import { toIsoDate } from './class-session.dates';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { Weekday } from 'src/enum/weekday.enum';
import {
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';

/**
 * Recovering a class that cannot be held — E12/S9 — with the database mocked away.
 *
 * What is held here is the refusal order and the three starting states: a scheduled row is edited,
 * a cancelled row is edited and put back on, a missing row is written. The e2e suite holds what
 * only Postgres shows — the unique index, the calendar, the outbox.
 *
 * 2027-04-05 is a Monday, which is the group's day.
 */
const MONDAY = '2027-04-05';
const TUESDAY = '2027-04-06';
const NEXT_MONDAY = '2027-04-12';

describe('RescheduleService', () => {
    let service: RescheduleService;
    let sessionRepo: MockRepository;
    let groupRepo: MockRepository;
    let roomRepo: MockRepository;
    let closedDates: jest.Mock;
    let manager: MockEntityManager;
    let notifier: { notifyMoved: jest.Mock };

    const location = { id: 1, name: 'Drumul Taberei' };
    const room = { id: 1, name: 'Sala 1', location };
    const otherRoom = { id: 2, name: 'Sala 2', location };
    const group = {
        id: 7,
        name: 'Scratch Începători',
        weekday: Weekday.MONDAY,
        startTime: '16:00:00',
        endTime: '17:30:00',
        room,
        isActive: true,
    } as unknown as Group;

    const scheduled = () => ({
        id: 3,
        status: ClassSessionStatus.SCHEDULED,
        notes: null as string | null,
        attendances: [] as { id: number }[],
        date: new Date(2027, 3, 5),
        startTime: '16:00:00',
        endTime: '17:30:00',
        isVacation: false,
        group: { id: 7 },
        room: { ...room },
    });
    const cancelled = () => ({ ...scheduled(), status: ClassSessionStatus.CANCELLED, notes: 'Anulată automat: Paște' });

    /** A row on the missed day (or none), and what else the group has in the week. */
    const timetable = (source: ReturnType<typeof scheduled> | null, inWeek: { id: number; date: Date }[] = source ? [source] : []) => {
        sessionRepo.findOne!.mockResolvedValue(source);
        sessionRepo.find!.mockResolvedValue(inWeek);
    };

    const recover = (overrides: Record<string, unknown> = {}) =>
        service.reschedule({ groupId: 7, date: MONDAY, targetDate: TUESDAY, reason: 'Luni e zi liberă', ...overrides });

    const codeOf = async (promise: Promise<unknown>) => {
        const error = await promise.catch((e: unknown) => e);
        return (error as ConflictException).getResponse();
    };

    beforeEach(async () => {
        sessionRepo = createMockRepository();
        groupRepo = createMockRepository();
        roomRepo = createMockRepository();
        manager = createMockEntityManager(new Map([[ClassSession, sessionRepo]]));
        notifier = { notifyMoved: jest.fn().mockResolvedValue(0) };
        closedDates = jest.fn().mockResolvedValue(new Set<string>());

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RescheduleService,
                provideMockRepository(ClassSession, sessionRepo),
                provideMockRepository(Group, groupRepo),
                provideMockRepository(Room, roomRepo),
                { provide: NonTeachingPeriodService, useValue: { datesIn: closedDates } },
                { provide: ClassSessionNotifier, useValue: notifier },
                provideMockDataSource(manager),
            ],
        }).compile();
        service = module.get(RescheduleService);

        groupRepo.findOne!.mockResolvedValue(group);
        // The address teaches at 16:00 (this group) and 18:00 (another one).
        groupRepo.find!.mockResolvedValue([group, { ...group, id: 8, startTime: '18:00:00', endTime: '19:30:00' }]);
        roomRepo.find!.mockResolvedValue([room, otherRoom]);
        roomRepo.findOne!.mockResolvedValue(otherRoom);
        sessionRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [], one: null }));
        sessionRepo.create!.mockImplementation((row: unknown) => ({ ...(row as object) }));
        sessionRepo.save!.mockImplementation((row: unknown) => Promise.resolve({ id: 42, ...(row as object) }));
    });

    describe('the windows', () => {
        // The Sunday before: nothing in the week has begun.
        const now = new Date(2027, 3, 4, 12, 0);

        it('describes a scheduled class and offers the free slots of its week', async () => {
            timetable(scheduled());

            const result = await service.windowsFor({ groupId: 7, date: MONDAY }, now);

            expect(result.week).toEqual({ from: MONDAY, to: '2027-04-11' });
            expect(result.source).toMatchObject({ id: 3, status: 'scheduled', hasAttendance: false, startTime: '16:00', roomName: 'Sala 1' });
            expect(result.blocked).toBeNull();
            expect(result.usual).toEqual({ startTime: '16:00', endTime: '17:30', roomId: 1, roomName: 'Sala 1' });
            // Its own slot is not on offer; the other room at the same hour is.
            expect(result.windows.some((window) => window.date === MONDAY && window.startTime === '16:00' && window.roomId === 1)).toBe(false);
            expect(result.windows[0]).toMatchObject({ date: MONDAY, startTime: '16:00', endTime: '17:30', roomId: 2 });
        });

        it('says the class was never generated, and that the calendar closed the day', async () => {
            timetable(null);
            closedDates.mockResolvedValue(new Set([MONDAY]));

            const result = await service.windowsFor({ groupId: 7, date: MONDAY }, now);

            expect(result.source).toBeNull();
            expect(result.missedDayClosed).toBe(true);
            expect(result.blocked).toBeNull();
            expect(result.windows.map((window) => window.date)).not.toContain(MONDAY);
            expect(result.windows[0]).toMatchObject({ date: TUESDAY, startTime: '16:00', roomId: 1 });
        });

        it('asks the calendar for the whole week, at the group’s own address', async () => {
            timetable(scheduled());

            await service.windowsFor({ groupId: 7, date: MONDAY }, now);

            const [from, until, locationId] = closedDates.mock.calls[0] as [Date, Date, number];
            expect(toIsoDate(from)).toBe(MONDAY);
            expect(toIsoDate(until)).toBe(NEXT_MONDAY);
            expect(locationId).toBe(1);
        });

        it('uses the hours the address teaches at, and its rooms with the group’s own first', async () => {
            timetable(null);
            roomRepo.find!.mockResolvedValue([otherRoom, room]);

            const result = await service.windowsFor({ groupId: 7, date: MONDAY }, now);

            const tuesday = result.windows.filter((window) => window.date === TUESDAY);
            expect(tuesday.map((window) => `${window.startTime}@${window.roomId}`)).toEqual(['16:00@1', '16:00@2', '18:00@1', '18:00@2']);
        });

        it('leaves out a room another live class holds at that hour', async () => {
            timetable(null);
            sessionRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ date: TUESDAY, room: { id: 1 }, startTime: '17:00:00', endTime: '18:30:00' } as never] }),
            );

            const result = await service.windowsFor({ groupId: 7, date: MONDAY }, now);

            const tuesdayAtFour = result.windows.filter((window) => window.date === TUESDAY && window.startTime === '16:00');
            expect(tuesdayAtFour.map((window) => window.roomId)).toEqual([2]);
        });

        it('blocks a class that was taught, and looks no further', async () => {
            timetable({ ...scheduled(), attendances: [{ id: 1 }] });

            const result = await service.windowsFor({ groupId: 7, date: MONDAY }, now);

            expect(result.blocked).toMatchObject({ code: 'CLASS_SESSION_HAS_ATTENDANCE' });
            expect(result.source).toMatchObject({ hasAttendance: true });
            expect(result.windows).toEqual([]);
            expect(roomRepo.find).not.toHaveBeenCalled();
        });

        it('blocks a day the group never teaches on, when there is no row', async () => {
            timetable(null);

            const result = await service.windowsFor({ groupId: 7, date: TUESDAY }, now);

            expect(result.blocked).toMatchObject({ code: 'CLASS_SESSION_NOT_FOUND' });
            expect(result.blocked?.message).toContain('luni');
        });

        it('blocks a week whose class already sits on another day', async () => {
            timetable(null, [{ id: 9, date: new Date(2027, 3, 6) }]);

            const result = await service.windowsFor({ groupId: 7, date: MONDAY }, now);

            expect(result.blocked).toMatchObject({ code: 'GROUP_ALREADY_HAS_SESSION_THAT_WEEK' });
            expect(result.blocked?.message).toContain(TUESDAY);
        });

        it('404s on a group that does not exist', async () => {
            groupRepo.findOne!.mockResolvedValue(null);

            await expect(service.windowsFor({ groupId: 99, date: MONDAY }, now)).rejects.toThrow(NotFoundException);
        });
    });

    describe('the recovery', () => {
        it('edits the scheduled row: same id, new day, note says where it came from', async () => {
            timetable(scheduled());

            const saved = await recover();

            expect(saved.id).toBe(3);
            expect(toIsoDate(saved.date)).toBe(TUESDAY);
            expect(saved.status).toBe(ClassSessionStatus.SCHEDULED);
            expect(saved.notes).toBe('Recuperată (de pe 2027-04-05 16:00): Luni e zi liberă');
            expect(sessionRepo.create).not.toHaveBeenCalled();
        });

        it('puts a cancelled row back on and moves it, keeping the cancellation in the notes', async () => {
            timetable(cancelled());

            const saved = await recover();

            expect(saved.id).toBe(3);
            expect(saved.status).toBe(ClassSessionStatus.SCHEDULED);
            expect(saved.notes).toBe('Anulată automat: Paște\n\nRecuperată (de pe 2027-04-05 16:00): Luni e zi liberă');
            expect(toIsoDate(saved.date)).toBe(TUESDAY);
        });

        it('writes the row the generator never did, on the target day, with the group’s own hour and room', async () => {
            timetable(null);

            const saved = await recover();

            expect(sessionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ group }));
            expect(saved.id).toBe(42);
            expect(toIsoDate(saved.date)).toBe(TUESDAY);
            expect(saved.startTime).toBe('16:00:00');
            expect(saved.endTime).toBe('17:30:00');
            expect(saved.room).toMatchObject({ id: 1 });
            expect(saved.status).toBe(ClassSessionStatus.SCHEDULED);
            expect(saved.notes).toBe('Recuperată (de pe 2027-04-05 16:00): Luni e zi liberă');
        });

        it('defaults the hour and the room to the class’s own, and takes what is named', async () => {
            timetable(scheduled());

            const saved = await recover({ startTime: '18:00', endTime: '19:30', roomId: 2 });

            expect(saved.startTime).toBe('18:00:00');
            expect(saved.endTime).toBe('19:30:00');
            expect(saved.room).toMatchObject({ id: 2 });
        });

        it('tells the families once, where the class was and where it went, inside the transaction', async () => {
            timetable(null);

            await recover();

            expect(notifier.notifyMoved).toHaveBeenCalledTimes(1);
            expect(notifier.notifyMoved).toHaveBeenCalledWith(
                42,
                { date: MONDAY, startTime: '16:00', roomName: 'Sala 1', locationName: 'Drumul Taberei' },
                'Luni e zi liberă',
                manager,
            );
        });

        it('names the cancelled row’s own slot as where the class came from', async () => {
            timetable({ ...cancelled(), startTime: '17:00:00', endTime: '18:30:00' });

            await recover();

            expect(notifier.notifyMoved).toHaveBeenCalledWith(3, expect.objectContaining({ date: MONDAY, startTime: '17:00' }), 'Luni e zi liberă', manager);
        });

        it('refuses another week — that would change the month the class is billed to', async () => {
            timetable(scheduled());

            expect(await codeOf(recover({ targetDate: NEXT_MONDAY }))).toMatchObject({ error: 'RESCHEDULE_OUT_OF_WEEK' });
            expect(sessionRepo.save).not.toHaveBeenCalled();
        });

        it('refuses the slot the class already holds', async () => {
            timetable(scheduled());

            const error = await recover({ targetDate: MONDAY }).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect((error as BadRequestException).getResponse()).toMatchObject({ error: 'MOVE_CHANGES_NOTHING' });
        });

        it('refuses to generate a missing class on its own day, as if that were a recovery', async () => {
            timetable(null);

            expect(await codeOf(recover({ targetDate: MONDAY }))).toMatchObject({ error: 'MOVE_CHANGES_NOTHING' });
        });

        it('lets the same day through when the hour or the room changes', async () => {
            timetable(scheduled());

            const saved = await recover({ targetDate: MONDAY, roomId: 2 });

            expect(toIsoDate(saved.date)).toBe(MONDAY);
            expect(saved.room).toMatchObject({ id: 2 });
        });

        it('obeys the school calendar on the target day, at the target room’s address', async () => {
            timetable(scheduled());
            closedDates.mockResolvedValue(new Set([TUESDAY]));

            expect(await codeOf(recover())).toMatchObject({ error: 'MOVED_ONTO_NON_TEACHING_DAY' });
            expect(closedDates).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 1);
        });

        it('refuses a day the group already has a class on', async () => {
            const source = scheduled();
            timetable(source, [source, { id: 9, date: new Date(2027, 3, 6) }]);

            expect(await codeOf(recover())).toMatchObject({ error: 'GROUP_ALREADY_HAS_SESSION_THAT_DAY' });
        });

        it('refuses a room already taken at that hour by a live class', async () => {
            timetable(scheduled());
            sessionRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { id: 9, startTime: '16:30:00', endTime: '18:00:00' } as never }));

            expect(await codeOf(recover())).toMatchObject({ error: 'ROOM_BUSY_AT_THAT_TIME' });
        });

        it('refuses a class that was taught', async () => {
            timetable({ ...scheduled(), attendances: [{ id: 1 }] });

            const error = await recover().catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ConflictException);
            expect((error as ConflictException).getResponse()).toMatchObject({ error: 'CLASS_SESSION_HAS_ATTENDANCE' });
        });

        it('404s a day the group has no class on and never would have', async () => {
            timetable(null);

            const error = await recover({ date: TUESDAY, targetDate: '2027-04-07' }).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(NotFoundException);
            expect((error as NotFoundException).getResponse()).toMatchObject({ error: 'CLASS_SESSION_NOT_FOUND' });
        });

        it('refuses to write a second row into a week that already has the group’s class', async () => {
            timetable(null, [{ id: 9, date: new Date(2027, 3, 7) }]);

            const error = await recover().catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ConflictException);
            expect((error as ConflictException).getResponse()).toMatchObject({ error: 'GROUP_ALREADY_HAS_SESSION_THAT_WEEK' });
            expect(sessionRepo.create).not.toHaveBeenCalled();
        });

        it('refuses an end before the start', async () => {
            timetable(scheduled());

            await expect(recover({ startTime: '17:00', endTime: '16:00' })).rejects.toThrow(BadRequestException);
        });

        it('404s on a room that does not exist', async () => {
            timetable(scheduled());
            roomRepo.findOne!.mockResolvedValue(null);

            await expect(recover({ roomId: 99 })).rejects.toThrow(NotFoundException);
        });

        it('says nothing to anybody when the recovery is refused', async () => {
            timetable(scheduled());

            await recover({ targetDate: NEXT_MONDAY }).catch(() => undefined);

            expect(notifier.notifyMoved).not.toHaveBeenCalled();
        });
    });
});
