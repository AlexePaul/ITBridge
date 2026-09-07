import { Test, TestingModule } from '@nestjs/testing';
import { EarlySignalsService } from './early-signals.service';
import { OccupancyReportService } from './occupancy-report.service';
import { Attendance } from 'src/entities/attendance.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

/**
 * The early signals — E21/S7 — with the database mocked away.
 *
 * The rules are tested on their own in `signals.rules.spec.ts`; what is held here is the assembly:
 * marks folded per child and per session, the arrears list turned into families, the occupancy
 * report's own flags repeated, and the totals and basis that let the screen say what it rests on.
 */
describe('EarlySignalsService', () => {
    let service: EarlySignalsService;
    let attendanceRepo: MockRepository;
    let noticeRepo: MockRepository;
    let arrears: { list: jest.Mock };
    let occupancy: { build: jest.Mock };

    const AS_OF = new Date(2026, 2, 30);

    const location = { id: 1, name: 'Drumul Taberei' };
    const scratch = { id: 7, name: 'Scratch', isActive: true, room: { id: 1, location } };
    const python = { id: 8, name: 'Python', isActive: true, room: { id: 1, location } };
    interface ParentFixture {
        id: number;
        firstName: string;
        lastName: string;
        phone: string | null;
        email: string | null;
    }
    const parent: ParentFixture = { id: 20, firstName: 'Maria', lastName: 'Pop', phone: '+40700000001', email: 'maria@example.com' };
    const ana = { id: 100, firstName: 'Ana', lastName: 'Pop', parent };
    const radu = {
        id: 101,
        firstName: 'Radu',
        lastName: 'Ion',
        parent: { id: 21, firstName: 'Ion', lastName: 'Ion', phone: null, email: null } as ParentFixture,
    };

    let nextId = 1;
    /** One mark on a session of `group`, on `date`. Session ids are derived from the date so marks share them. */
    const mark = (child: typeof ana, group: typeof scratch, date: string, present: boolean) =>
        ({
            id: nextId++,
            present,
            child,
            classSession: { id: Number(date.replace(/-/g, '')) * 10 + group.id, date: new Date(`${date}T00:00:00`), startTime: '16:00:00', group },
        }) as unknown as Attendance;

    beforeEach(async () => {
        attendanceRepo = createMockRepository();
        noticeRepo = createMockRepository();
        arrears = { list: jest.fn().mockResolvedValue([]) };
        occupancy = { build: jest.fn().mockResolvedValue({ groups: [] }) };
        attendanceRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [] }));
        noticeRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [] }));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EarlySignalsService,
                provideMockRepository(Attendance, attendanceRepo),
                provideMockRepository(AbsenceNotice, noticeRepo),
                { provide: ArrearsService, useValue: arrears },
                { provide: OccupancyReportService, useValue: occupancy },
            ],
        }).compile();
        service = module.get(EarlySignalsService);
    });

    const withMarks = (marks: Attendance[]) => attendanceRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: marks }));

    it('is empty, and says so, on a school with nothing to flag', async () => {
        const signals = await service.build(AS_OF);

        expect(signals.asOf).toBe('2026-03-30');
        expect(signals.lookbackFrom).toBe('2025-12-30');
        expect(signals.totals).toEqual({ children: 0, groups: 0, families: 0, underfilled: 0, all: 0 });
        expect(signals.basis).toEqual({ marksRead: 0, childrenWithMarks: 0, sessionsWithRegister: 0, groupsWithHistory: 0, occupancyAsOfToday: true });
        expect(signals.thresholds).toEqual({
            childAbsenceStreak: 3,
            staleStreakAfterDays: 21,
            groupAttendanceWindow: 3,
            groupAttendanceDrop: 0.2,
            familyOverdueInvoices: 2,
            occupancy: 0.6,
        });
    });

    it('reads the marks in the window, regular ones, on classes that were not cancelled', async () => {
        await service.build(AS_OF);

        const qb = attendanceRepo.createQueryBuilder!.mock.results[0].value as ReturnType<typeof createMockQueryBuilder>;
        expect(qb.andWhereCalls.some(([condition, params]) => condition.includes('mark.type') && params?.regular === 'regular')).toBe(true);
        expect(qb.andWhereCalls.some(([condition, params]) => condition.includes('session.status') && params?.cancelled === 'cancelled')).toBe(true);
        expect(
            qb.andWhereCalls.some(([condition, params]) => condition.includes('session.date') && params?.from === '2025-12-30' && params?.to === '2026-03-30'),
        ).toBe(true);
    });

    describe('children', () => {
        it('flags a child whose last three marks are absences, with the family and where to look', async () => {
            withMarks([
                mark(ana, scratch, '2026-03-02', true),
                mark(ana, scratch, '2026-03-09', false),
                mark(ana, scratch, '2026-03-16', false),
                mark(ana, scratch, '2026-03-23', false),
                mark(radu, scratch, '2026-03-23', true),
            ]);

            const signals = await service.build(AS_OF);

            expect(signals.children).toEqual([
                {
                    childId: 100,
                    childName: 'Ana Pop',
                    groupId: 7,
                    groupName: 'Scratch',
                    parentId: 20,
                    parentName: 'Maria Pop',
                    phone: '+40700000001',
                    email: 'maria@example.com',
                    streak: 3,
                    since: '2026-03-09',
                    lastMarkOn: '2026-03-23',
                    announced: 0,
                },
            ]);
            expect(signals.totals.children).toBe(1);
            expect(signals.basis).toMatchObject({ marksRead: 5, childrenWithMarks: 2, sessionsWithRegister: 4 });
        });

        it('says how many of the run the family had announced', async () => {
            const absences = [mark(ana, scratch, '2026-03-09', false), mark(ana, scratch, '2026-03-16', false), mark(ana, scratch, '2026-03-23', false)];
            withMarks(absences);
            noticeRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ child: { id: 100 }, classSession: { id: absences[0].classSession.id } } as never] }),
            );

            const signals = await service.build(AS_OF);

            expect(signals.children[0]).toMatchObject({ streak: 3, announced: 1 });
            // Only the flagged children are asked about, by id.
            const qb = noticeRepo.createQueryBuilder!.mock.results[0].value as ReturnType<typeof createMockQueryBuilder>;
            expect(qb.andWhereCalls.some(([, params]) => Array.isArray(params?.childIds) && (params?.childIds as number[]).includes(100))).toBe(true);
        });

        it('does not ask about notices when nobody is flagged', async () => {
            withMarks([mark(ana, scratch, '2026-03-23', true)]);

            await service.build(AS_OF);

            expect(noticeRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('keeps a streak across a transfer, and names the group of the last mark', async () => {
            withMarks([mark(ana, scratch, '2026-03-09', false), mark(ana, scratch, '2026-03-16', false), mark(ana, python, '2026-03-23', false)]);

            const signals = await service.build(AS_OF);

            expect(signals.children[0]).toMatchObject({ streak: 3, groupId: 8, groupName: 'Python' });
        });

        it('lets a child go once their last mark is three weeks old', async () => {
            withMarks([mark(ana, scratch, '2026-02-16', false), mark(ana, scratch, '2026-02-23', false), mark(ana, scratch, '2026-03-02', false)]);

            expect((await service.build(new Date(2026, 2, 23))).children).toHaveLength(1);
            expect((await service.build(new Date(2026, 2, 24))).children).toHaveLength(0);
        });

        it('puts the longest streak first, then the most recent', async () => {
            withMarks([
                mark(ana, scratch, '2026-03-02', false),
                mark(ana, scratch, '2026-03-09', false),
                mark(ana, scratch, '2026-03-16', false),
                mark(radu, scratch, '2026-03-09', false),
                mark(radu, scratch, '2026-03-16', false),
                mark(radu, scratch, '2026-03-23', false),
                mark(radu, scratch, '2026-03-24', false),
            ]);

            const signals = await service.build(AS_OF);

            expect(signals.children.map((child) => child.childName)).toEqual(['Radu Ion', 'Ana Pop']);
            expect(signals.children[0]).toMatchObject({ parentName: 'Ion Ion', phone: null, email: null });
        });
    });

    describe('groups', () => {
        const held = (group: typeof scratch, date: string, present: boolean[]) =>
            present.map((isPresent, index) => mark({ ...ana, id: 200 + index }, group, date, isPresent));

        it('flags a group whose last three sessions are emptier than the three before', async () => {
            withMarks([
                ...held(scratch, '2026-02-16', [true, true, true, true]),
                ...held(scratch, '2026-02-23', [true, true, true, true]),
                ...held(scratch, '2026-03-02', [true, true, true, false]),
                ...held(scratch, '2026-03-09', [true, true, false, false]),
                ...held(scratch, '2026-03-16', [true, false, false, false]),
                ...held(scratch, '2026-03-23', [true, false, false, false]),
            ]);

            const signals = await service.build(AS_OF);

            expect(signals.groups).toEqual([
                {
                    groupId: 7,
                    groupName: 'Scratch',
                    locationName: 'Drumul Taberei',
                    recentRate: 0.33,
                    previousRate: 0.92,
                    drop: 0.59,
                    sessions: 6,
                    lastSessionOn: '2026-03-23',
                },
            ]);
            expect(signals.basis.groupsWithHistory).toBe(1);
        });

        it('does not judge a group with fewer than two windows, but counts it in the basis', async () => {
            withMarks([
                ...held(scratch, '2026-03-09', [true, false]),
                ...held(scratch, '2026-03-16', [false, false]),
                ...held(scratch, '2026-03-23', [false, false]),
            ]);

            const signals = await service.build(AS_OF);

            expect(signals.groups).toEqual([]);
            expect(signals.basis.groupsWithHistory).toBe(0);
            expect(signals.basis.sessionsWithRegister).toBe(3);
        });

        it('leaves an inactive group alone', async () => {
            const retired = { ...scratch, isActive: false };
            withMarks([
                ...held(retired, '2026-02-16', [true, true]),
                ...held(retired, '2026-02-23', [true, true]),
                ...held(retired, '2026-03-02', [true, true]),
                ...held(retired, '2026-03-09', [false, false]),
                ...held(retired, '2026-03-16', [false, false]),
                ...held(retired, '2026-03-23', [false, false]),
            ]);

            const signals = await service.build(AS_OF);

            expect(signals.groups).toEqual([]);
            expect(signals.basis.groupsWithHistory).toBe(0);
        });
    });

    describe('families', () => {
        it('asks the arrears list as of the day, and flags families two invoices behind', async () => {
            arrears.list.mockResolvedValue([
                { invoiceId: 1, parentId: 20, parentName: 'Maria Pop', email: 'maria@example.com', phone: '+40700000001', daysOverdue: 45, outstanding: 350 },
                { invoiceId: 2, parentId: 20, parentName: 'Maria Pop', email: 'maria@example.com', phone: '+40700000001', daysOverdue: 16, outstanding: 200 },
                { invoiceId: 3, parentId: 21, parentName: 'Ion Ion', email: null, phone: null, daysOverdue: 40, outstanding: 600 },
                { invoiceId: 4, parentId: 21, parentName: 'Ion Ion', email: null, phone: null, daysOverdue: 0, outstanding: 600 },
            ]);

            const signals = await service.build(AS_OF);

            expect(arrears.list).toHaveBeenCalledWith(AS_OF);
            expect(signals.families).toEqual([
                {
                    parentId: 20,
                    parentName: 'Maria Pop',
                    email: 'maria@example.com',
                    phone: '+40700000001',
                    invoices: 2,
                    outstanding: 550,
                    oldestDaysOverdue: 45,
                },
            ]);
        });
    });

    describe('under-filled groups', () => {
        it("repeats the occupancy report's own flags, emptiest first, and nothing else", async () => {
            occupancy.build.mockResolvedValue({
                groups: [
                    {
                        groupId: 8,
                        name: 'Python',
                        locationName: 'Drumul Taberei',
                        taken: 3,
                        capacity: 10,
                        free: 7,
                        waiting: 0,
                        fillRate: 0.3,
                        underThreshold: true,
                    },
                    {
                        groupId: 7,
                        name: 'Scratch',
                        locationName: 'Drumul Taberei',
                        taken: 9,
                        capacity: 10,
                        free: 1,
                        waiting: 2,
                        fillRate: 0.9,
                        underThreshold: false,
                    },
                ],
            });

            const signals = await service.build(AS_OF);

            expect(signals.underfilled).toEqual([
                { groupId: 8, groupName: 'Python', locationName: 'Drumul Taberei', taken: 3, capacity: 10, free: 7, waiting: 0, fillRate: 0.3 },
            ]);
            expect(signals.totals).toMatchObject({ underfilled: 1, all: 1 });
        });
    });
});
