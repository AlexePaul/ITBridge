import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EnrollmentService, WAITLIST_RESPONSE_HOURS } from './enrollment.service';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Child } from 'src/entities/child.entity';
import { Group } from 'src/entities/group.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { Role } from 'src/enum/role.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import {
    createMockEntityManager,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';

describe('EnrollmentService', () => {
    let service: EnrollmentService;
    let enrollmentRepo: MockRepository;
    let waitlistRepo: MockRepository;
    let childRepo: MockRepository;
    let groupRepo: MockRepository;
    let outbox: Record<string, jest.Mock>;
    let manager: MockEntityManager;

    /** A family whose account passes both E11/S2 gates. */
    const activeParent = { id: 5, role: Role.PARENT, emailConfirmedAt: new Date(), approvalStatus: ApprovalStatus.APPROVED };
    const child = { id: 1, firstName: 'Maria', parent: { id: 10, email: 'ana@example.com', user: activeParent } };
    const group = (overrides: Record<string, unknown> = {}) => ({ id: 2, name: 'Scratch Începători', capacity: 10, isActive: true, ...overrides });

    beforeEach(async () => {
        enrollmentRepo = createMockRepository();
        waitlistRepo = createMockRepository();
        childRepo = createMockRepository();
        groupRepo = createMockRepository();
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }) };

        childRepo.findOne!.mockResolvedValue(child);
        groupRepo.findOne!.mockResolvedValue(group());
        enrollmentRepo.findOne!.mockResolvedValue(null);
        enrollmentRepo.count!.mockResolvedValue(0);
        waitlistRepo.count!.mockResolvedValue(0);
        waitlistRepo.findOne!.mockResolvedValue(null);

        manager = createMockEntityManager(
            new Map<unknown, MockRepository>([
                [Enrollment, enrollmentRepo],
                [WaitlistEntry, waitlistRepo],
                [Child, childRepo],
                [Group, groupRepo],
            ]),
        );
        manager.save.mockImplementation((_entity: unknown, data: Record<string, unknown>) => Promise.resolve({ id: 99, ...data }));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EnrollmentService,
                provideMockRepository(Enrollment, enrollmentRepo),
                provideMockRepository(WaitlistEntry, waitlistRepo),
                provideMockRepository(Child, childRepo),
                provideMockRepository(Group, groupRepo),
                { provide: OutboxService, useValue: outbox },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(EnrollmentService);
    });

    /** The body of a thrown Nest exception, which is where the stable error code lives. */
    const responseOf = (error: unknown) => (error as ConflictException).getResponse() as { error?: string; message?: string };

    describe('enrol', () => {
        it('opens an ACTIVE enrolment by default, starting today', async () => {
            await service.enrol({ childId: 1, groupId: 2 }, 42);

            expect(manager.save).toHaveBeenCalledWith(
                Enrollment,
                expect.objectContaining({ status: EnrollmentStatus.ACTIVE, endDate: null, startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
            );
        });

        it('writes Child.group in the same transaction, so the derived column cannot lag', async () => {
            enrollmentRepo.findOne!.mockResolvedValueOnce(null).mockResolvedValue({ id: 99, group: { id: 2 } });

            await service.enrol({ childId: 1, groupId: 2 }, 42);

            // Six queries still read this column, two of them security-relevant. It is derived, so
            // it has exactly one writer, and that writer runs inside the transaction that justifies
            // the value.
            expect(manager.update).toHaveBeenCalledWith(Child, { id: 1 }, { group: { id: 2 } });
        });

        it('refuses a second enrolment while one is in force, naming the group', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ id: 7, group: { id: 3, name: 'Python Începători' } });

            // D6: a child is in one group. The message names the other group, because "already
            // enrolled" without saying where is a message that sends an admin looking.
            const error = await service.enrol({ childId: 1, groupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('CHILD_ALREADY_ENROLLED');
            expect(responseOf(error).message).toContain('Python Începători');
        });

        it('counts a booked trial as a seat taken', async () => {
            // D7, the rule easiest to get wrong: a group of ten with nine enrolled and one trial is
            // full. `countInForce` is what has to include trials, and this says so.
            enrollmentRepo.count!.mockResolvedValue(10);

            const error = await service.enrol({ childId: 1, groupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('GROUP_FULL');
        });

        it('offers the waiting list in the refusal, because that is the next thing to do', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            const error = await service.enrol({ childId: 1, groupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).message).toContain('lista de așteptare');
        });

        it('lets an admin over capacity only when they ask for it explicitly', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.enrol({ childId: 1, groupId: 2, allowOverCapacity: true }, 42);

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('refuses a child whose family account is still waiting', async () => {
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { ...child.parent, user: { ...activeParent, emailConfirmedAt: null } } });

            const error = await service.enrol({ childId: 1, groupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('PARENT_ACCOUNT_NOT_ACTIVE');
        });

        it('enrols a child whose family has no account at all', async () => {
            // The admin-typed-it-in-from-a-phone-call flow. Nothing to confirm, nobody to approve.
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { id: 10, user: null } });

            await service.enrol({ childId: 1, groupId: 2 }, 42);

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('refuses an inactive group', async () => {
            groupRepo.findOne!.mockResolvedValue(group({ isActive: false }));

            const error = await service.enrol({ childId: 1, groupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('GROUP_INACTIVE');
        });

        it('refuses to open an enrolment in a closed status', async () => {
            await expect(service.enrol({ childId: 1, groupId: 2, status: EnrollmentStatus.COMPLETED }, 42)).rejects.toThrow(BadRequestException);
        });

        it('settles any waitlist request the child had for that group', async () => {
            await service.enrol({ childId: 1, groupId: 2 }, 42);

            // Left open, the family would keep a place in a queue for a seat they are sitting in.
            expect(waitlistRepo.update).toHaveBeenCalledWith(expect.objectContaining({ child: { id: 1 } }), { status: WaitlistStatus.ACCEPTED });
        });

        it('404s on a child that does not exist', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.enrol({ childId: 99, groupId: 2 }, 42)).rejects.toThrow(NotFoundException);
        });

        it('404s on a group that does not exist', async () => {
            groupRepo.findOne!.mockResolvedValue(null);
            await expect(service.enrol({ childId: 1, groupId: 99 }, 42)).rejects.toThrow(NotFoundException);
        });
    });

    describe('close', () => {
        const inForce = { id: 9, status: EnrollmentStatus.ACTIVE, child: { id: 1 }, group: { id: 2 } };

        beforeEach(() => {
            enrollmentRepo.findOne!.mockResolvedValue(inForce);
            enrollmentRepo.findOneOrFail!.mockResolvedValue({ ...inForce, status: EnrollmentStatus.WITHDRAWN });
        });

        it('stamps an end date and the reason', async () => {
            await service.close(9, { status: EnrollmentStatus.WITHDRAWN, exitReason: 'S-a mutat din oraș' });

            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9 },
                expect.objectContaining({ status: EnrollmentStatus.WITHDRAWN, exitReason: 'S-a mutat din oraș', endDate: expect.any(String) }),
            );
        });

        it('refuses to close into a status that is still in force', async () => {
            await expect(service.close(9, { status: EnrollmentStatus.ACTIVE })).rejects.toThrow(BadRequestException);
        });

        it('refuses to close an enrolment that is already history', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...inForce, status: EnrollmentStatus.COMPLETED });

            const error = await service.close(9, { status: EnrollmentStatus.WITHDRAWN }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('ENROLLMENT_ALREADY_CLOSED');
        });

        it('offers the freed seat to the first family waiting, and mails them', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.findOne!.mockResolvedValue({
                id: 4,
                child: { firstName: 'Vlad', parent: { email: 'parinte@example.com' } },
                group: { id: 2, name: 'Scratch Începători' },
            });

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(manager.update).toHaveBeenCalledWith(
                WaitlistEntry,
                { id: 4 },
                expect.objectContaining({ status: WaitlistStatus.OFFERED, respondBy: expect.any(Date) }),
            );
            // In the same transaction as the release: an offer that survives the process dying
            // between the two writes is the only version of "within a minute" that holds.
            expect(outbox.queue).toHaveBeenCalledWith(expect.objectContaining({ to: 'parinte@example.com' }), manager);
        });

        it('puts the group and a real deadline in the offer, because the list is a promise', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.findOne!.mockResolvedValue({
                id: 4,
                child: { firstName: 'Vlad', parent: { email: 'parinte@example.com' } },
                group: { id: 2, name: 'Scratch Începători' },
            });

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            const [[offer]] = outbox.queue.mock.calls as [[{ bodyText: string }]];
            expect(offer.bodyText).toContain('Scratch Începători');

            const update = manager.update.mock.calls.find((call) => call[0] === WaitlistEntry);
            const respondBy = (update?.[2] as { respondBy: Date }).respondBy;
            expect(respondBy.getTime()).toBeGreaterThan(Date.now() + (WAITLIST_RESPONSE_HOURS - 1) * 3_600_000);
        });

        it('offers nothing when the group is still full', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('offers nothing when nobody is waiting', async () => {
            enrollmentRepo.count!.mockResolvedValue(5);
            waitlistRepo.findOne!.mockResolvedValue(null);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('still offers the seat when the family has no email, rather than skipping them', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.findOne!.mockResolvedValue({
                id: 4,
                child: { firstName: 'Vlad', parent: { email: null } },
                group: { id: 2, name: 'Scratch Începători' },
            });

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            // The seat is theirs and the clock runs; somebody has to phone. Skipping to the next
            // family would quietly punish the one the school entered from a phone call.
            expect(manager.update).toHaveBeenCalledWith(WaitlistEntry, { id: 4 }, expect.objectContaining({ status: WaitlistStatus.OFFERED }));
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('clears Child.group when the last enrolment closes', async () => {
            enrollmentRepo.findOne!.mockResolvedValueOnce(inForce).mockResolvedValue(null);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(manager.update).toHaveBeenCalledWith(Child, { id: 1 }, { group: null });
        });
    });

    describe('occupancyOf', () => {
        it('reports free seats as capacity minus everything in force', async () => {
            enrollmentRepo.count!.mockResolvedValue(7);
            waitlistRepo.count!.mockResolvedValue(3);

            await expect(service.occupancyOf(2)).resolves.toEqual({ groupId: 2, capacity: 10, taken: 7, free: 3, waiting: 3 });
        });

        it('never reports negative free seats, even after an over-capacity enrolment', async () => {
            enrollmentRepo.count!.mockResolvedValue(12);

            await expect(service.occupancyOf(2)).resolves.toMatchObject({ taken: 12, free: 0 });
        });
    });

    describe('the waiting list', () => {
        it('refuses a second open request for the same child and group', async () => {
            waitlistRepo.findOne!.mockResolvedValue({ id: 4 });

            // A family that calls twice should find itself already on the list, not twice on it
            // ahead of people who called once.
            const error = await service.addToWaitlist({ childId: 1, groupId: 2 }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('ALREADY_ON_WAITLIST');
        });

        it('accepts a request even when the group has room', async () => {
            waitlistRepo.create!.mockImplementation((entry: unknown) => entry);
            waitlistRepo.save!.mockImplementation((entry: unknown) => Promise.resolve(entry));
            enrollmentRepo.count!.mockResolvedValue(1);

            // An admin on a phone call should not have to check a number first.
            await expect(service.addToWaitlist({ childId: 1, groupId: 2, note: 'Sună după 17' })).resolves.toMatchObject({ note: 'Sună după 17' });
        });

        it('hands the seat on to the next family when an offer is declined', async () => {
            waitlistRepo
                .findOne! // The entry being removed, then the next one in the queue — `removeFromWaitlist`
                // re-runs the offer, which is the whole point of declining.
                .mockResolvedValueOnce({ id: 4, status: WaitlistStatus.OFFERED, group: { id: 2 } })
                .mockResolvedValue({
                    id: 5,
                    child: { firstName: 'Ioana', parent: { email: 'urmatorul@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                });
            enrollmentRepo.count!.mockResolvedValue(9);

            await service.removeFromWaitlist(4, WaitlistStatus.DECLINED);

            expect(manager.update).toHaveBeenCalledWith(WaitlistEntry, { id: 4 }, { status: WaitlistStatus.DECLINED });
            expect(manager.update).toHaveBeenCalledWith(WaitlistEntry, { id: 5 }, expect.objectContaining({ status: WaitlistStatus.OFFERED }));
            expect(outbox.queue).toHaveBeenCalledWith(expect.objectContaining({ to: 'urmatorul@example.com' }), manager);
        });

        it('does not re-run the queue when the entry was merely waiting', async () => {
            waitlistRepo.findOne!.mockResolvedValue({ id: 4, status: WaitlistStatus.WAITING, group: { id: 2 } });

            await service.removeFromWaitlist(4);

            // Nothing was released, so there is no seat to hand on. Re-running would offer a seat
            // that is not free.
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('404s on an entry that does not exist', async () => {
            waitlistRepo.findOne!.mockResolvedValue(null);

            await expect(service.removeFromWaitlist(99)).rejects.toThrow(NotFoundException);
        });
    });

    describe('historyFor', () => {
        it('asks for the whole history, newest first', async () => {
            enrollmentRepo.find!.mockResolvedValue([]);

            await service.historyFor(1);

            // The question S1 exists to answer: "which group was this child in last October".
            expect(enrollmentRepo.find!.mock.calls[0][0]).toMatchObject({
                where: { child: { id: 1 } },
                order: { startDate: 'DESC', id: 'DESC' },
            });
        });
    });
});
