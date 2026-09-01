import { Test, TestingModule } from '@nestjs/testing';
import { OverviewService } from './overview.service';
import { Group } from 'src/entities/group.entity';
import { Project } from 'src/entities/project.entity';
import { User } from 'src/entities/user.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { ClassSessionService } from 'src/modules/class-session/class-session.service';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { Role } from 'src/enum/role.enum';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

/**
 * The overview — E21/S1.
 *
 * The interesting assertions are not the arithmetic; they are that this screen **asks** rather than
 * re-derives. A second definition of "unmarked" or "overdue" would drift, and the one on a screen
 * somebody glances at is the one that drifts unnoticed, precisely because nobody checks a glance.
 */
describe('OverviewService', () => {
    let service: OverviewService;
    let groupRepo: MockRepository;
    let projectRepo: MockRepository;
    let userRepo: MockRepository;
    let outboxRepo: MockRepository;
    let classSessions: { findSessions: jest.Mock; findUnmarkedSessions: jest.Mock };
    let enrollments: { occupancyOf: jest.Mock };
    let arrears: { list: jest.Mock };

    const DAY = new Date(2026, 2, 20);

    const session = (id: number, marked: boolean, name = 'Scratch') => ({
        id,
        group: { name },
        startTime: '16:00:00',
        endTime: '17:30:00',
        room: { location: { name: 'Drumul Taberei' } },
        hasAttendance: marked,
    });

    beforeEach(async () => {
        groupRepo = createMockRepository();
        projectRepo = createMockRepository();
        userRepo = createMockRepository();
        outboxRepo = createMockRepository();
        classSessions = { findSessions: jest.fn().mockResolvedValue([]), findUnmarkedSessions: jest.fn().mockResolvedValue([]) };
        enrollments = { occupancyOf: jest.fn() };
        arrears = { list: jest.fn().mockResolvedValue([]) };

        groupRepo.find!.mockResolvedValue([]);
        projectRepo.count!.mockResolvedValue(0);
        userRepo.count!.mockResolvedValue(0);
        outboxRepo.count!.mockResolvedValue(0);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OverviewService,
                provideMockRepository(Group, groupRepo),
                provideMockRepository(Project, projectRepo),
                provideMockRepository(User, userRepo),
                provideMockRepository(OutboxMessage, outboxRepo),
                { provide: ClassSessionService, useValue: classSessions },
                { provide: EnrollmentService, useValue: enrollments },
                { provide: ArrearsService, useValue: arrears },
            ],
        }).compile();
        service = module.get(OverviewService);
    });

    describe('it asks rather than re-derives', () => {
        it('gets unmarked registers from the service the daily reminder uses', async () => {
            await service.build(DAY);
            expect(classSessions.findUnmarkedSessions).toHaveBeenCalled();
        });

        it('gets arrears from the service that derives them from succeeded payments', async () => {
            await service.build(DAY);
            expect(arrears.list).toHaveBeenCalledWith(DAY);
        });

        it('gets occupancy from the service that counts a trial as a seat', async () => {
            groupRepo.find!.mockResolvedValue([{ id: 3, name: 'Scratch', room: { location: { name: 'DT' } } }]);
            enrollments.occupancyOf.mockResolvedValue({ capacity: 10, taken: 10, free: 0, waiting: 0 });

            await service.build(DAY);

            // D7: a child on a trial holds a chair. A query written here would be a second answer.
            expect(enrollments.occupancyOf).toHaveBeenCalledWith(3);
        });
    });

    describe("today's classes", () => {
        it('counts how many of the day are marked', async () => {
            classSessions.findSessions.mockResolvedValue([session(1, true), session(2, false), session(3, true)]);

            const overview = await service.build(DAY);

            expect(overview.today.total).toBe(3);
            expect(overview.today.marked).toBe(2);
            expect(overview.today.sessions[1]).toMatchObject({ id: 2, marked: false, locationName: 'Drumul Taberei' });
        });

        it('asks for the day as an admin, so it sees the whole school', async () => {
            await service.build(DAY);
            expect(classSessions.findSessions).toHaveBeenCalledWith({ dateFrom: '2026-03-20', dateTo: '2026-03-20' }, Role.ADMIN, 0);
        });

        it('survives a session whose group somehow did not load', async () => {
            classSessions.findSessions.mockResolvedValue([{ id: 1, startTime: '16:00:00', endTime: '17:30:00', hasAttendance: false }]);
            const overview = await service.build(DAY);
            expect(overview.today.sessions[0].groupName).toBe('Grupă necunoscută');
        });
    });

    describe('the backlog', () => {
        it('looks at the week behind today, today excluded', async () => {
            await service.build(DAY);

            // What is unmarked in the day still in progress is not a backlog; it is work being done.
            expect(classSessions.findUnmarkedSessions).toHaveBeenCalledWith({ dateFrom: '2026-03-13', dateTo: '2026-03-19' });
        });
    });

    describe('the money', () => {
        const row = (parentId: number, outstanding: number, bucket = 'overdue') => ({ parentId, outstanding, bucket });

        it('counts families, not invoices', async () => {
            // One family with two unpaid months is one family to phone, not two.
            arrears.list.mockResolvedValue([row(1, 350), row(1, 350), row(2, 150)]);

            const overview = await service.build(DAY);

            expect(overview.arrears.families).toBe(2);
            expect(overview.arrears.outstanding).toBe(850);
        });

        it('separates the ones the platform has stopped writing to', async () => {
            arrears.list.mockResolvedValue([row(1, 350, 'over_60'), row(2, 150, 'overdue')]);
            const overview = await service.build(DAY);
            // Those are the rows where an email will not do it any more.
            expect(overview.arrears.over60).toBe(1);
        });
    });

    describe('groups nearly full', () => {
        beforeEach(() => {
            groupRepo.find!.mockResolvedValue([
                { id: 1, name: 'Plină', room: { location: { name: 'DT' } } },
                { id: 2, name: 'Un loc', room: { location: { name: 'DT' } } },
                { id: 3, name: 'Goală', room: { location: { name: 'DT' } } },
            ]);
            enrollments.occupancyOf.mockImplementation((id: number) =>
                Promise.resolve({ capacity: 10, taken: id === 1 ? 10 : id === 2 ? 9 : 4, free: id === 1 ? 0 : id === 2 ? 1 : 6, waiting: 0 }),
            );
        });

        it('shows only the ones with a seat or less, fullest first', async () => {
            const overview = await service.build(DAY);

            expect(overview.groupsNearlyFull.map((group) => group.name)).toEqual(['Plină', 'Un loc']);
        });

        it('asks only about active groups — a closed one has no waiting list to worry about', async () => {
            await service.build(DAY);
            expect(groupRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        });
    });

    describe('the queues that go stale', () => {
        it('counts families waiting to be let in', async () => {
            userRepo.count!.mockResolvedValue(2);
            const overview = await service.build(DAY);
            // E11/S2's own stated risk: an admin who does not open the approvals screen on a Friday
            // turns an enrolment into silence.
            expect(overview.pendingApprovals).toBe(2);
        });

        it('counts documents uploaded and sent to nobody', async () => {
            projectRepo.count!.mockResolvedValue(5);
            await expect(service.build(DAY)).resolves.toMatchObject({ projectsAwaitingSend: 5 });
        });

        it('counts messages that had nowhere to go', async () => {
            outboxRepo.count!.mockResolvedValue(1);
            // A family who was not reached and does not know it — E17/S5.
            await expect(service.build(DAY)).resolves.toMatchObject({ undeliverableMessages: 1 });
        });
    });
});
