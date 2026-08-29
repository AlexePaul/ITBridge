import { Test, TestingModule } from '@nestjs/testing';
import { ObjectLiteral } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClassSessionService } from './class-session.service';
import { toIsoDate } from './class-session.dates';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { Weekday } from 'src/enum/weekday.enum';
import { Role } from 'src/enum/role.enum';
import {
    createMockQueryBuilder,
    createMockRepository,
    isScopedToUser,
    MockQueryBuilder,
    MockRepository,
    provideMockRepository,
} from 'src/testing/repository.mock';

/**
 * The horizon is always pinned to an explicit `from` rather than to today. A test that starts from
 * the real clock passes on a Monday and fails on a Wednesday, and the eight-week arithmetic is
 * exactly the thing that must not be checked against itself.
 *
 * 2026-09-01 is a Tuesday. Both weekdays below are chosen against that: Wednesday is "the day after
 * the horizon opens", Tuesday is "the day the horizon opens", which is the edge that decides whether
 * eight weeks means eight sessions or nine.
 */
const FROM = '2026-09-01';

describe('ClassSessionService', () => {
    let service: ClassSessionService;
    let sessionRepo: MockRepository;
    let groupRepo: MockRepository;

    const room = { id: 1, name: 'Sala 1', location: { id: 1, name: 'Drumul Taberei' } };
    const group = {
        id: 7,
        name: 'Scratch Începători',
        weekday: Weekday.WEDNESDAY,
        startTime: '16:00:00',
        endTime: '17:30:00',
        room,
        isActive: true,
    } as unknown as Group;

    /** Every session `save` was asked to write, as ISO dates, in the order they were built. */
    function savedDates(): string[] {
        const rows = sessionRepo.save!.mock.calls.flatMap((call) => call[0] as { date: Date }[]);
        return rows.map((row) => toIsoDate(row.date));
    }

    beforeEach(async () => {
        sessionRepo = createMockRepository();
        groupRepo = createMockRepository();
        const module: TestingModule = await Test.createTestingModule({
            providers: [ClassSessionService, provideMockRepository(ClassSession, sessionRepo), provideMockRepository(Group, groupRepo)],
        }).compile();
        service = module.get(ClassSessionService);

        groupRepo.find!.mockResolvedValue([group]);
        groupRepo.findOne!.mockResolvedValue(group);
        sessionRepo.find!.mockResolvedValue([]);
        sessionRepo.create!.mockImplementation((row: unknown) => ({ ...(row as object) }));
        sessionRepo.save!.mockImplementation((rows: unknown) => Promise.resolve(rows));
    });

    describe('generation', () => {
        it('writes eight weeks of one weekday, and nothing outside them', async () => {
            const result = await service.generateSessions({ from: FROM });

            // 2026-09-01 is a Tuesday, so the first Wednesday is the 2nd.
            expect(savedDates()).toEqual(['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14', '2026-10-21']);
            expect(result.created).toBe(8);
            expect(result.existing).toBe(0);
            expect(result.groups).toBe(1);
        });

        // The edge the half-open window exists for: the horizon is 8 * 7 days, so a group meeting on
        // the very first day gets a session on it and *not* on day 56, which is the same weekday.
        it('includes the first day of the horizon and excludes the day the horizon ends', async () => {
            groupRepo.find!.mockResolvedValue([{ ...group, weekday: Weekday.TUESDAY }]);

            const result = await service.generateSessions({ from: FROM });

            const dates = savedDates();
            expect(dates).toHaveLength(8);
            expect(dates[0]).toBe(FROM);
            expect(dates[7]).toBe('2026-10-20');
            expect(dates).not.toContain('2026-10-27'); // day 56, the first day past the horizon
            // Reported inclusively: the caller asked for eight weeks starting the 1st, so the last
            // day of what they asked for is the 26th, not the 27th.
            expect(result.from).toBe(FROM);
            expect(result.to).toBe('2026-10-26');
        });

        it('honours a horizon other than eight weeks', async () => {
            await service.generateSessions({ from: FROM, weeks: 2 });

            expect(savedDates()).toEqual(['2026-09-02', '2026-09-09']);
        });

        it('writes nothing the second time, and reports what was already there', async () => {
            await service.generateSessions({ from: FROM });
            const first = savedDates();
            // What the driver hands back: a `date` column comes out of Postgres as a string, not a
            // Date. If the comparison in the service did not normalise both sides, this is the test
            // that would catch it — and the duplicate would only appear against a real database.
            sessionRepo.find!.mockResolvedValue(first.map((date, index) => ({ id: index + 1, date, status: ClassSessionStatus.SCHEDULED })));
            sessionRepo.save!.mockClear();

            const second = await service.generateSessions({ from: FROM });

            expect(sessionRepo.save).not.toHaveBeenCalled();
            expect(second.created).toBe(0);
            expect(second.existing).toBe(8);
            expect(second.sessions).toEqual([]);
        });

        // The half of idempotency that matters more than not duplicating: a class somebody called
        // off must stay called off. Re-running the generator is a routine, and a routine that
        // quietly un-cancels classes is worse than one that duplicates them.
        it('leaves an existing session alone even when it was cancelled', async () => {
            sessionRepo.find!.mockResolvedValue([{ id: 1, date: '2026-09-16', status: ClassSessionStatus.CANCELLED }]);

            const result = await service.generateSessions({ from: FROM });

            expect(savedDates()).not.toContain('2026-09-16');
            expect(result.created).toBe(7);
            expect(result.existing).toBe(1);
        });

        it('copies the schedule and the room off the group, and starts every session scheduled', async () => {
            await service.generateSessions({ from: FROM, weeks: 1 });

            expect(sessionRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ group, room, startTime: '16:00:00', endTime: '17:30:00', status: ClassSessionStatus.SCHEDULED, notes: null }),
            );
        });

        it('covers every active group when no group is named', async () => {
            await service.generateSessions({ from: FROM });

            expect(groupRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        });

        it('rejects a group that does not exist', async () => {
            groupRepo.findOne!.mockResolvedValue(null);
            await expect(service.generateSessions({ groupId: 99, from: FROM })).rejects.toThrow(NotFoundException);
            expect(sessionRepo.save).not.toHaveBeenCalled();
        });

        it('refuses to fill a timetable for an inactive group', async () => {
            groupRepo.findOne!.mockResolvedValue({ ...group, isActive: false });
            await expect(service.generateSessions({ groupId: 7, from: FROM })).rejects.toThrow(ConflictException);
            expect(sessionRepo.save).not.toHaveBeenCalled();
        });

        it('rejects a start date that is not a real day', async () => {
            await expect(service.generateSessions({ from: '2026-02-30' })).rejects.toThrow(BadRequestException);
        });
    });

    describe('listing', () => {
        let qb: MockQueryBuilder;

        /** Whoever is asking. The two ids differ so a narrowing to the wrong one cannot pass. */
        const ADMIN_ID = 1;
        const PARENT_ID = 42;

        function listReturning(rows: unknown[]): void {
            qb = createMockQueryBuilder({ many: rows as Record<string, unknown>[] });
            sessionRepo.createQueryBuilder!.mockReturnValue(qb);
        }

        beforeEach(() => listReturning([]));

        it('reduces the attendance count to a flag, and sends neither the count nor the marks', async () => {
            listReturning([
                { id: 1, date: '2026-09-02', attendanceCount: 3 },
                { id: 2, date: '2026-09-09', attendanceCount: 0, attendances: [] },
            ]);

            const rows = await service.findSessions({}, Role.ADMIN, ADMIN_ID);

            expect(rows[0].hasAttendance).toBe(true);
            expect(rows[1].hasAttendance).toBe(false);
            expect(rows[0]).not.toHaveProperty('attendanceCount');
            expect(rows[1]).not.toHaveProperty('attendances');
        });

        // A session that has no marks loaded at all is not a session that was marked. Without the
        // fallback, `undefined > 0` is false anyway — but only by accident, and the accident stops
        // being true the day the count is renamed.
        it('treats a missing count as unmarked', async () => {
            listReturning([{ id: 1, date: '2026-09-02' }]);

            const rows = await service.findSessions({}, Role.ADMIN, ADMIN_ID);

            expect(rows[0].hasAttendance).toBe(false);
        });

        it('includes both ends of the interval', async () => {
            await service.findSessions({ dateFrom: '2026-09-01', dateTo: '2026-09-30' }, Role.ADMIN, ADMIN_ID);

            const conditions = qb.andWhereCalls.map(([condition]) => condition);
            expect(conditions).toContain('session.date >= :dateFrom');
            expect(conditions).toContain('session.date <= :dateTo');
        });

        it('narrows to one group when asked, and to none when not', async () => {
            await service.findSessions({ groupId: 7 }, Role.ADMIN, ADMIN_ID);
            expect(qb.andWhereCalls).toContainEqual(['group.id = :groupId', { groupId: 7 }]);

            listReturning([]);
            await service.findSessions({}, Role.ADMIN, ADMIN_ID);
            expect(qb.andWhereCalls).toEqual([]);
        });

        it('rejects a reversed interval instead of answering "nothing found"', async () => {
            await expect(service.findSessions({ dateFrom: '2026-09-30', dateTo: '2026-09-01' }, Role.ADMIN, ADMIN_ID)).rejects.toThrow(BadRequestException);
        });

        it('accepts an interval of a single day', async () => {
            await expect(service.findSessions({ dateFrom: '2026-09-01', dateTo: '2026-09-01' }, Role.ADMIN, ADMIN_ID)).resolves.toEqual([]);
        });

        describe('row-level authorization', () => {
            it('leaves an admin looking at the whole school', async () => {
                await service.findSessions({}, Role.ADMIN, ADMIN_ID);

                expect(isScopedToUser(qb, ADMIN_ID)).toBe(false);
                expect(qb.leftJoinCalls).not.toContain('group.children');
            });

            // The route from a session to a family: it has no parent of its own, so it goes through
            // the group's enrolled children.
            it('narrows a parent to the groups their own children are in', async () => {
                await service.findSessions({}, Role.PARENT, PARENT_ID);

                expect(isScopedToUser(qb, PARENT_ID)).toBe(true);
                expect(qb.leftJoinCalls).toEqual(['group.children', 'child.parent', 'parent.user']);
            });

            // A group id in the query string is a request, not a claim. Asking about somebody
            // else's group must keep the restriction and simply match nothing.
            it('keeps the restriction when the parent names a group that is not theirs', async () => {
                await service.findSessions({ groupId: 999 }, Role.PARENT, PARENT_ID);

                expect(isScopedToUser(qb, PARENT_ID)).toBe(true);
                expect(qb.andWhereCalls).toContainEqual(['group.id = :groupId', { groupId: 999 }]);
            });

            // The trap from CLAUDE.md: `where` replaces the whole clause, so one anywhere after the
            // narrowing hands the parent the entire school back without a word.
            it('composes with andWhere only, never where', async () => {
                await service.findSessions(
                    { groupId: 7, dateFrom: '2026-09-01', dateTo: '2026-09-30', status: ClassSessionStatus.SCHEDULED },
                    Role.PARENT,
                    PARENT_ID,
                );

                expect(qb.where).not.toHaveBeenCalled();
                expect(isScopedToUser(qb, PARENT_ID)).toBe(true);
            });
        });
    });

    describe('unmarked sessions', () => {
        let qb: MockQueryBuilder;

        beforeEach(() => {
            qb = createMockQueryBuilder<ObjectLiteral>({ many: [] });
            sessionRepo.createQueryBuilder!.mockReturnValue(qb);
        });

        it('asks only for sessions with no attendance rows at all', async () => {
            await service.findUnmarkedSessions({ dateFrom: '2026-09-02', dateTo: '2026-09-02' });

            expect(qb.leftJoinCalls).toContain('session.attendances');
            expect(qb.andWhereCalls.map(([condition]) => condition)).toContain('attendance.id IS NULL');
        });

        // A cancelled class has no register to take. Reporting it as unmarked would put a task
        // nobody has to do into a daily reminder, which is how a daily reminder stops being read.
        it('leaves a cancelled session out, by asking only for scheduled ones', async () => {
            await service.findUnmarkedSessions({ dateFrom: '2026-09-02', dateTo: '2026-09-02' });

            expect(qb.andWhereCalls).toContainEqual(['session.status = :status', { status: ClassSessionStatus.SCHEDULED }]);
        });

        it('bounds the interval at both ends, inclusively', async () => {
            await service.findUnmarkedSessions({ dateFrom: '2026-09-01', dateTo: '2026-09-07' });

            expect(qb.andWhereCalls).toContainEqual(['session.date >= :dateFrom', { dateFrom: '2026-09-01' }]);
            expect(qb.andWhereCalls).toContainEqual(['session.date <= :dateTo', { dateTo: '2026-09-07' }]);
        });

        it('rejects a reversed interval rather than reporting an empty all-clear', async () => {
            await expect(service.findUnmarkedSessions({ dateFrom: '2026-09-07', dateTo: '2026-09-01' })).rejects.toThrow(BadRequestException);
            expect(qb.getMany).not.toHaveBeenCalled();
        });
    });

    describe('cancellation', () => {
        const scheduled = { id: 3, status: ClassSessionStatus.SCHEDULED, notes: null, attendances: [] };

        beforeEach(() => {
            sessionRepo.findOne!.mockResolvedValue({ ...scheduled });
            sessionRepo.save!.mockImplementation((row: unknown) => Promise.resolve(row));
        });

        it('cancels the session and records the reason', async () => {
            const cancelled = await service.cancelSession(3, { reason: 'Profesor bolnav' });

            expect(cancelled.status).toBe(ClassSessionStatus.CANCELLED);
            expect(cancelled.notes).toBe('Anulată: Profesor bolnav');
        });

        it('keeps notes that were already there', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...scheduled, notes: 'Sală schimbată' });

            const cancelled = await service.cancelSession(3, { reason: 'Zăpadă' });

            expect(cancelled.notes).toBe('Sală schimbată\n\nAnulată: Zăpadă');
        });

        it('rejects a session that does not exist', async () => {
            sessionRepo.findOne!.mockResolvedValue(null);
            await expect(service.cancelSession(99, { reason: 'Profesor bolnav' })).rejects.toThrow(NotFoundException);
        });

        it('refuses to cancel twice, rather than overwriting the first reason', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...scheduled, status: ClassSessionStatus.CANCELLED });
            await expect(service.cancelSession(3, { reason: 'Alt motiv' })).rejects.toThrow(ConflictException);
            expect(sessionRepo.save).not.toHaveBeenCalled();
        });

        // Marks against a class are proof it happened, whatever the status column says.
        it('refuses to cancel a class that already has attendance recorded', async () => {
            sessionRepo.findOne!.mockResolvedValue({ ...scheduled, attendances: [{ id: 1 }] });
            await expect(service.cancelSession(3, { reason: 'Profesor bolnav' })).rejects.toThrow(ConflictException);
            expect(sessionRepo.save).not.toHaveBeenCalled();
        });
    });
});
