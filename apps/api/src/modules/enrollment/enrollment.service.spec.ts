import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ageOf, bandFor, compatibilityWarnings, EnrollmentService, WAITLIST_RESPONSE_HOURS } from './enrollment.service';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Child } from 'src/entities/child.entity';
import { Group } from 'src/entities/group.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { Role } from 'src/enum/role.enum';
import { LessThan } from 'typeorm';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { LeadProgressService } from 'src/modules/lead/lead-progress.service';
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
    let absenceNoticeRepo: MockRepository;
    let outbox: Record<string, jest.Mock>;
    /** E20/S1: resolving a trial tells its lead. Asserted for real in the lead suites and the e2e. */
    let leadProgress: Record<string, jest.Mock>;
    let manager: MockEntityManager;

    /** A family whose account passes both E11/S2 gates. */
    const activeParent = { id: 5, role: Role.PARENT, emailConfirmedAt: new Date(), approvalStatus: ApprovalStatus.APPROVED };
    const child = {
        id: 1,
        firstName: 'Maria',
        // Nine years old at the seed date, comfortably inside the 7-12 band below, so the age check
        // stays out of the way of every test that is not about it.
        birthDate: `${new Date().getFullYear() - 9}-01-01`,
        // Complete, so the E11/S2 profile gate stays out of the way of every test that is not
        // about it — the same reason `activeParent` passes both account gates above.
        parent: {
            id: 10,
            email: 'ana@example.com',
            phone: '+40712345678',
            address: 'Strada Exemplu 1',
            emergencyContactName: 'Bunica Ioana',
            emergencyContactRelation: 'bunică',
            emergencyContactPhone: '+40712345679',
            user: activeParent,
        },
    };
    const group = (overrides: Record<string, unknown> = {}) => ({
        id: 2,
        name: 'Scratch Începători',
        capacity: 10,
        isActive: true,
        minAge: 7,
        maxAge: 12,
        ...overrides,
    });

    beforeEach(async () => {
        enrollmentRepo = createMockRepository();
        waitlistRepo = createMockRepository();
        childRepo = createMockRepository();
        groupRepo = createMockRepository();
        absenceNoticeRepo = createMockRepository();
        // `queueOrRecord` for the lapsed-offer mail in E11/S3: a family with no address has to leave
        // a row saying so, not be skipped.
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }), queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };
        leadProgress = { settleForEnrollment: jest.fn().mockResolvedValue(undefined), markTrialHeld: jest.fn(), revertTrialHeld: jest.fn() };

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
                // E20/S2 gave this service the per-class seat count as well, so it now reads the
                // make-up ledger: a child sitting in on a make-up fills a chair for that hour.
                provideMockRepository(AbsenceNotice, absenceNoticeRepo),
                { provide: OutboxService, useValue: outbox },
                // E20/S1: resolving a trial tells its lead what happened. Mocked here because this
                // suite is about seats; the real behaviour is asserted in the lead suites and e2e.
                { provide: LeadProgressService, useValue: leadProgress },
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

        it('refuses when the family has an account but has not finished step two of registration', async () => {
            // Registration is two required steps since E11/S2; a child cannot sit in a room while
            // the school has no phone number and no emergency contact for them.
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { ...child.parent, emergencyContactPhone: null } });

            await expect(service.enrol({ childId: 1, groupId: 2 }, 1)).rejects.toMatchObject({
                response: { error: 'PARENT_PROFILE_INCOMPLETE' },
            });
        });

        it('says the profile is incomplete rather than that the account is inactive — they are repaired by different people', async () => {
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { ...child.parent, phone: null } });

            await expect(service.enrol({ childId: 1, groupId: 2 }, 1)).rejects.toMatchObject({
                response: { error: 'PARENT_PROFILE_INCOMPLETE' },
            });
        });

        it('exempts a profile with no account, so the public trial form can still book a seat', async () => {
            // E20/S2 writes a shell profile with no user, no email and no phone, then enrols
            // through this same method. Holding it to the rule would refuse every booking.
            childRepo.findOne!.mockResolvedValue({
                ...child,
                parent: { id: 11, email: null, phone: null, user: null },
            });

            await expect(service.enrol({ childId: 1, groupId: 2 }, null)).resolves.toBeDefined();
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

    /**
     * The sweep — E11/S3, the piece the story was missing.
     *
     * The defect it closes is not visible from any screen: an offer nobody answered stayed
     * `OFFERED` forever, and `offerFreedSeat` only ever looks at `WAITING`, so the seat was held by
     * a family who had already lost it and the next one was never asked.
     */
    describe('expireLapsedOffers', () => {
        const lapsed = {
            id: 4,
            status: WaitlistStatus.OFFERED,
            respondBy: new Date('2026-03-01T10:00:00Z'),
            child: { firstName: 'Vlad', parent: { email: 'parinte@example.com' } },
            group: { id: 2, name: 'Scratch Începători' },
        };

        it('asks only for offers whose deadline has already passed', async () => {
            waitlistRepo.find!.mockResolvedValue([]);
            const now = new Date('2026-03-02T09:00:00Z');

            await service.expireLapsedOffers(now);

            expect(waitlistRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: expect.objectContaining({ status: WaitlistStatus.OFFERED, respondBy: LessThan(now) }) }),
            );
        });

        it('expires the entry, tells the family, and hands the seat to the next one', async () => {
            waitlistRepo.find!.mockResolvedValue([lapsed]);
            // A seat is free once the lapsed entry stops holding it, and somebody is next in line.
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.findOne!.mockResolvedValue({
                id: 5,
                child: { firstName: 'Ana', parent: { email: 'urmatorul@example.com' } },
                group: { id: 2, name: 'Scratch Începători' },
            });

            const result = await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'));

            expect(result).toEqual({ expired: 1 });
            expect(manager.update).toHaveBeenCalledWith(WaitlistEntry, { id: 4 }, { status: WaitlistStatus.EXPIRED });
            // The family whose offer lapsed: the last thing the school told them was that they had
            // a seat until Thursday, and that has stopped being true.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: 'parinte@example.com' }, expect.any(Object), manager);
            // And the next family, through the same door a decline goes through.
            expect(outbox.queue).toHaveBeenCalledWith(expect.objectContaining({ to: 'urmatorul@example.com' }), manager);
        });

        it('leaves a record rather than skipping a family with no address', async () => {
            waitlistRepo.find!.mockResolvedValue([{ ...lapsed, child: { firstName: 'Vlad', parent: { email: null } } }]);
            enrollmentRepo.count!.mockResolvedValue(10);
            waitlistRepo.findOne!.mockResolvedValue(null);

            await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'));

            // They are the family who most needs the phone call, so the row has to exist.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.any(Object), manager);
        });

        it('still expires the entry when nobody is waiting behind it', async () => {
            waitlistRepo.find!.mockResolvedValue([lapsed]);
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.findOne!.mockResolvedValue(null);

            const result = await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'));

            // The seat going back to the group is the point; an empty queue does not make the stale
            // offer worth keeping.
            expect(result).toEqual({ expired: 1 });
            expect(manager.update).toHaveBeenCalledWith(WaitlistEntry, { id: 4 }, { status: WaitlistStatus.EXPIRED });
        });

        it('does nothing, and says so, when no offer has lapsed', async () => {
            waitlistRepo.find!.mockResolvedValue([]);

            expect(await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'))).toEqual({ expired: 0 });
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('takes the oldest deadline first', async () => {
            waitlistRepo.find!.mockResolvedValue([]);

            await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'));

            // Two lapsing in the same hour: the family kept waiting longest moves on first.
            expect(waitlistRepo.find).toHaveBeenCalledWith(expect.objectContaining({ order: { respondBy: 'ASC', id: 'ASC' } }));
        });
    });

    describe('transfer (S5)', () => {
        const current = { id: 9, status: EnrollmentStatus.ACTIVE, group: { id: 3, name: 'Python' }, contractSignedAt: '2026-01-01' };

        beforeEach(() => {
            enrollmentRepo.findOne!.mockResolvedValue(current);
        });

        it('closes the old enrolment and opens the new one, in one transaction', async () => {
            await service.transfer({ childId: 1, toGroupId: 2 }, 42);

            // Either way round without the transaction gives two live enrolments or a child with
            // none — and at capacity, a seat that frees before the transfer completes.
            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9 },
                expect.objectContaining({ status: EnrollmentStatus.TRANSFERRED, endDate: expect.any(String) }),
            );
            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.objectContaining({ group: { id: 2 }, endDate: null }));
        });

        it('carries the status across, so a trial that moves is still a trial', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...current, status: EnrollmentStatus.TRIAL });

            await service.transfer({ childId: 1, toGroupId: 2 }, 42);

            // Promoting it here would enrol a family that has not decided yet.
            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.objectContaining({ status: EnrollmentStatus.TRIAL }));
        });

        it('carries the signed contract across, because it is the same enrolment continuing', async () => {
            await service.transfer({ childId: 1, toGroupId: 2 }, 42);

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.objectContaining({ contractSignedAt: '2026-01-01' }));
        });

        it('names the destination in the exit reason when nobody gives one', async () => {
            await service.transfer({ childId: 1, toGroupId: 2 }, 42);

            const update = manager.update.mock.calls.find((call) => call[0] === Enrollment);
            expect((update?.[2] as { exitReason: string }).exitReason).toContain('Scratch Începători');
        });

        it('refuses when there is nothing to transfer from', async () => {
            enrollmentRepo.findOne!.mockResolvedValue(null);

            const error = await service.transfer({ childId: 1, toGroupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('NOTHING_TO_TRANSFER');
        });

        it('refuses a transfer into the group the child is already in', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...current, group: { id: 2, name: 'Scratch Începători' } });

            const error = await service.transfer({ childId: 1, toGroupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('ALREADY_IN_GROUP');
        });

        it('checks capacity on the destination', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            const error = await service.transfer({ childId: 1, toGroupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('GROUP_FULL');
        });

        it('does not offer the freed seat to the queue', async () => {
            enrollmentRepo.count!.mockResolvedValue(5);
            waitlistRepo.findOne!.mockResolvedValue({
                id: 4,
                child: { firstName: 'Vlad', parent: { email: 'x@example.com' } },
                group: { id: 3, name: 'Python' },
            });

            await service.transfer({ childId: 1, toGroupId: 2 }, 42);

            // The seat is not free: it is being handed to this child. The queue is asked only when
            // a seat genuinely leaves the group.
            expect(outbox.queue).not.toHaveBeenCalled();
        });
    });

    describe('resolveTrial (S4)', () => {
        const trial = { id: 9, status: EnrollmentStatus.TRIAL, child: { id: 1 }, group: { id: 2 }, contractSignedAt: null };

        beforeEach(() => {
            enrollmentRepo.findOne!.mockResolvedValue(trial);
            enrollmentRepo.findOneOrFail!.mockResolvedValue({ ...trial, status: EnrollmentStatus.ACTIVE });
        });

        it('keeps the same row when the family stays, so the history reads as one period', async () => {
            await service.resolveTrial(9, { accepted: true });

            expect(manager.update).toHaveBeenCalledWith(Enrollment, { id: 9 }, expect.objectContaining({ status: EnrollmentStatus.ACTIVE }));
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('frees the seat and runs the queue when the family does not continue', async () => {
            enrollmentRepo.count!.mockResolvedValue(5);
            waitlistRepo.findOne!.mockResolvedValue({
                id: 4,
                child: { firstName: 'Vlad', parent: { email: 'x@example.com' } },
                group: { id: 2, name: 'Scratch Începători' },
            });

            await service.resolveTrial(9, { accepted: false, reason: 'Nu s-a potrivit programul' });

            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9 },
                expect.objectContaining({ status: EnrollmentStatus.WITHDRAWN, exitReason: 'Nu s-a potrivit programul' }),
            );
            expect(outbox.queue).toHaveBeenCalled();
        });

        it('refuses to resolve something that is not a trial', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...trial, status: EnrollmentStatus.ACTIVE });

            const error = await service.resolveTrial(9, { accepted: true }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('NOT_A_TRIAL');
        });
    });

    describe('compatibility (S6)', () => {
        it('refuses once with the ages named, and accepts on the retry', async () => {
            const sevenYearOld = { ...child, birthDate: `${new Date().getFullYear() - 7}-01-01` };
            childRepo.findOne!.mockResolvedValue(sevenYearOld);
            groupRepo.findOne!.mockResolvedValue(group({ minAge: 11, maxAge: 14 }));

            // A warning has to mean something: an admin enrolling a seven-year-old in an 11-14
            // group should have had to see that and say yes.
            const error = await service.enrol({ childId: 1, groupId: 2 }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('COMPATIBILITY_WARNINGS');
            expect(responseOf(error).message).toContain('11-14');

            await service.enrol({ childId: 1, groupId: 2, acknowledgeWarnings: true }, 42);
            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('says nothing when the age fits', async () => {
            await service.enrol({ childId: 1, groupId: 2 }, 42);

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('is a warning, not a block — unlike capacity', async () => {
            const sevenYearOld = { ...child, birthDate: `${new Date().getFullYear() - 7}-01-01` };
            childRepo.findOne!.mockResolvedValue(sevenYearOld);
            groupRepo.findOne!.mockResolvedValue(group({ minAge: 11, maxAge: 14, capacity: 10 }));
            enrollmentRepo.count!.mockResolvedValue(10);

            // Capacity is checked first and refuses outright: acknowledging warnings must not be a
            // way past a full room, because an eleventh chair is not a judgement call.
            const error = await service.enrol({ childId: 1, groupId: 2, acknowledgeWarnings: true }, 42).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('GROUP_FULL');
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

describe('compatibilityWarnings', () => {
    const bornYearsAgo = (years: number) => `${new Date().getFullYear() - years}-01-01`;

    it('warns below the band and above it, and stays quiet inside', () => {
        const band = { minAge: 9, maxAge: 12, name: 'Scratch' };

        expect(compatibilityWarnings({ birthDate: bornYearsAgo(7) as never }, band)[0]?.code).toBe('AGE_BELOW_GROUP');
        expect(compatibilityWarnings({ birthDate: bornYearsAgo(15) as never }, band)[0]?.code).toBe('AGE_ABOVE_GROUP');
        expect(compatibilityWarnings({ birthDate: bornYearsAgo(10) as never }, band)).toEqual([]);
    });

    it('treats the boundaries as inside the band', () => {
        const band = { minAge: 9, maxAge: 12, name: 'Scratch' };

        expect(compatibilityWarnings({ birthDate: bornYearsAgo(9) as never }, band)).toEqual([]);
        expect(compatibilityWarnings({ birthDate: bornYearsAgo(12) as never }, band)).toEqual([]);
    });
});

describe('ageOf', () => {
    it('counts whole years, not calendar-year differences', () => {
        // Born on New Year's Eve, asked about on New Year's Day: one day old, not one year.
        expect(ageOf('2025-12-31', new Date('2026-01-01T12:00:00Z'))).toBe(0);
        expect(ageOf('2026-01-01', new Date('2026-12-31T12:00:00Z'))).toBe(0);
        expect(ageOf('2016-06-15', new Date('2026-06-15T12:00:00Z'))).toBe(10);
        expect(ageOf('2016-06-15', new Date('2026-06-14T12:00:00Z'))).toBe(9);
    });
});

describe('bandFor', () => {
    it("puts every age in exactly one band, including the ones outside the school's range", () => {
        expect(bandFor(6)).toBe('6–8 ani');
        expect(bandFor(9)).toBe('9–10 ani');
        expect(bandFor(12)).toBe('11–12 ani');
        expect(bandFor(14)).toBe('13–14 ani');
        // A child of four still lands somewhere rather than disappearing from the screen.
        expect(bandFor(4)).toBe('6–8 ani');
        expect(bandFor(17)).toBe('15+ ani');
    });
});
