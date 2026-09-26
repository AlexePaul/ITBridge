import { Test, TestingModule } from '@nestjs/testing';
import { OverviewService } from './overview.service';
import { Group } from 'src/entities/group.entity';
import { User } from 'src/entities/user.entity';
import { ClassSessionService } from 'src/modules/class-session/class-session.service';
import { ProjectService } from 'src/modules/project/project.service';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { Role } from 'src/enum/role.enum';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { DeliveryLogService } from 'src/modules/mail/delivery-log.service';
import { STUCK_AFTER_MINUTES } from 'src/modules/mail/outbox-health.rules';
import { LeadService } from 'src/modules/lead/lead.service';

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
    let projects: { pendingSummary: jest.Mock };
    let userRepo: MockRepository;
    /** The mail module owns how many messages never arrived; the overview only asks. */
    let deliveries: { health: jest.Mock };
    let classSessions: { findSessions: jest.Mock; findUnmarkedSessions: jest.Mock };
    let enrollments: { occupancyOf: jest.Mock; withoutContract: jest.Mock };
    let arrears: { list: jest.Mock };
    /** The lead module owns who needs a call; the overview counts what it is handed. */
    let leads: { followUp: jest.Mock };

    const DAY = new Date(2026, 2, 20);

    const session = (id: number, marked: boolean, name = 'Scratch', status = 'scheduled') => ({
        id,
        group: { name },
        startTime: '16:00:00',
        endTime: '17:30:00',
        room: { location: { name: 'Drumul Taberei' } },
        hasAttendance: marked,
        status,
    });

    beforeEach(async () => {
        groupRepo = createMockRepository();
        projects = { pendingSummary: jest.fn() };
        userRepo = createMockRepository();
        deliveries = {
            health: jest.fn().mockResolvedValue({ failed: 0, undeliverable: 0, stuck: 0, stuckAfterMinutes: STUCK_AFTER_MINUTES }),
        };
        classSessions = { findSessions: jest.fn().mockResolvedValue([]), findUnmarkedSessions: jest.fn().mockResolvedValue([]) };
        enrollments = { occupancyOf: jest.fn(), withoutContract: jest.fn().mockResolvedValue([]) };
        arrears = { list: jest.fn().mockResolvedValue([]) };
        leads = { followUp: jest.fn().mockResolvedValue({ undecided: [], noSeats: [], stale: [], due: [], unassigned: 0 }) };

        groupRepo.find!.mockResolvedValue([]);
        projects.pendingSummary.mockResolvedValue({ total: 0, oldestDays: null, staleAfterDays: 2, byGroup: [] });
        userRepo.count!.mockResolvedValue(0);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                OverviewService,
                provideMockRepository(Group, groupRepo),
                provideMockRepository(User, userRepo),
                { provide: ClassSessionService, useValue: classSessions },
                { provide: EnrollmentService, useValue: enrollments },
                { provide: ArrearsService, useValue: arrears },
                { provide: DeliveryLogService, useValue: deliveries },
                { provide: ProjectService, useValue: projects },
                { provide: LeadService, useValue: leads },
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

        it("asks for the school's day, not the server's", async () => {
            // 00:30 on 20 March in Bucharest is still the 19th in UTC, where the server runs: the tile
            // showed yesterday's classes as today's for the first three hours of every day.
            await service.build(new Date('2026-03-19T22:30:00Z'));

            expect(classSessions.findSessions).toHaveBeenCalledWith({ dateFrom: '2026-03-20', dateTo: '2026-03-20' }, Role.ADMIN, 0);
            expect(classSessions.findUnmarkedSessions).toHaveBeenCalledWith({ dateFrom: '2026-03-13', dateTo: '2026-03-19' });
        });

        it('leaves out a cancelled class, which nobody will ever mark', async () => {
            // A day off cancels every class of the day: counted, the tile read "0 din 3 marcate" with
            // a „Nemarcată" badge on each, about classes that were never going to be held.
            classSessions.findSessions.mockResolvedValue([session(1, true), session(2, false, 'Python', 'cancelled'), session(3, false)]);

            const overview = await service.build(DAY);

            expect(overview.today.total).toBe(2);
            expect(overview.today.marked).toBe(1);
            expect(overview.today.sessions.map((row) => row.id)).toEqual([1, 3]);
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

        it('counts those as families too, like the line above them', async () => {
            // Two months past sixty days is still one family to phone; the tile said two.
            arrears.list.mockResolvedValue([row(1, 350, 'over_60'), row(1, 350, 'over_60'), row(2, 150, 'overdue')]);

            const overview = await service.build(DAY);

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

        /**
         * Asked of `ProjectService`, not counted here — E17/S8 moved the definition to the service
         * that owns it, and E21's rule is that a report sums what it is handed.
         */
        it('counts documents uploaded and sent to nobody, and how long the oldest has waited', async () => {
            projects.pendingSummary.mockResolvedValue({ total: 5, oldestDays: 4, staleAfterDays: 2, byGroup: [] });

            await expect(service.build(DAY)).resolves.toMatchObject({
                projectsAwaitingSend: 5,
                // The half a count cannot say: five from this afternoon and five from Tuesday are
                // the same number and completely different situations.
                projectsAwaitingSendOldestDays: 4,
            });
        });

        it('reports a null age when nothing is waiting, rather than zero days', async () => {
            projects.pendingSummary.mockResolvedValue({ total: 0, oldestDays: null, staleAfterDays: 2, byGroup: [] });

            await expect(service.build(DAY)).resolves.toMatchObject({ projectsAwaitingSend: 0, projectsAwaitingSendOldestDays: null });
        });

        it('asks the mail module what never arrived, rather than counting statuses itself', async () => {
            deliveries.health.mockResolvedValue({ failed: 2, undeliverable: 1, stuck: 4, stuckAfterMinutes: STUCK_AFTER_MINUTES });

            await expect(service.build(DAY)).resolves.toMatchObject({
                messagesNotDelivered: { failed: 2, undeliverable: 1, stuck: 4, stuckAfterMinutes: STUCK_AFTER_MINUTES },
            });
            // E21's rule: a report gathers, it does not define. Counting `undeliverable` here was
            // the second definition, and it was the one that was wrong.
            expect(deliveries.health).toHaveBeenCalledTimes(1);
        });

        it('asks about the day it is reporting on, because stuck is measured against a clock', async () => {
            await service.build(DAY);

            expect(deliveries.health).toHaveBeenCalledWith(DAY);
        });

        it('carries a message the provider refused, which the old tile read as zero', async () => {
            deliveries.health.mockResolvedValue({ failed: 3, undeliverable: 0, stuck: 0, stuckAfterMinutes: STUCK_AFTER_MINUTES });

            await expect(service.build(DAY)).resolves.toMatchObject({ messagesNotDelivered: { failed: 3 } });
        });

        // QA of 26 September 2026: the dashboard had no leads tile, and the office's daily email was
        // the only place a trial held with no decision showed up.
        it('counts the leads to call from the lists the daily email is made of, each lead once', async () => {
            const row = (id: number) => ({ lead: { id }, days: 3 });
            leads.followUp.mockResolvedValue({ undecided: [row(1), row(2)], noSeats: [row(3)], stale: [row(4)], due: [row(1), row(3)], unassigned: 5 });

            await expect(service.build(DAY)).resolves.toMatchObject({ leads: { toCall: 4, undecided: 2, noSeats: 1 } });
            expect(leads.followUp).toHaveBeenCalledWith(DAY);
        });
    });
});
