import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ageOf, bandFor, compatibilityWarnings, EnrollmentService, schoolToday, WAITLIST_RESPONSE_HOURS } from './enrollment.service';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Child } from 'src/entities/child.entity';
import { Group } from 'src/entities/group.entity';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { Role } from 'src/enum/role.enum';
import { In, LessThan } from 'typeorm';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { LeadProgressService } from 'src/modules/lead/lead-progress.service';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import {
    createMockEntityManager,
    createMockQueryBuilder,
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
    let audit: { record: jest.Mock };
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
        leadProgress = {
            settleForEnrollment: jest.fn().mockResolvedValue(undefined),
            followTransfer: jest.fn().mockResolvedValue(undefined),
            markTrialHeld: jest.fn(),
            revertTrialHeld: jest.fn(),
        };

        childRepo.findOne!.mockResolvedValue(child);
        groupRepo.findOne!.mockResolvedValue(group());
        enrollmentRepo.findOne!.mockResolvedValue(null);
        enrollmentRepo.count!.mockResolvedValue(0);
        waitlistRepo.count!.mockResolvedValue(0);
        waitlistRepo.findOne!.mockResolvedValue(null);
        // Nobody waiting unless a test says so: `offerFreeSeats` reads the head of the list with
        // `find`, and an unstubbed one would hand it `undefined` to loop over.
        waitlistRepo.find!.mockResolvedValue([]);

        manager = createMockEntityManager(
            new Map<unknown, MockRepository>([
                [Enrollment, enrollmentRepo],
                [WaitlistEntry, waitlistRepo],
                [Child, childRepo],
                [Group, groupRepo],
            ]),
        );
        manager.save.mockImplementation((_entity: unknown, data: Record<string, unknown>) => Promise.resolve({ id: 99, ...data }));
        // A conditional write on an enrolment hits only while the row is in the status it names, as
        // in the database — the row being the last one this suite's `findOne` handed out. `close`
        // and `transfer` try the trial-only write first; hitting every row, the mock would make each
        // active enrolment a trial.
        manager.update.mockImplementation(async (entity: unknown, criteria: { status?: unknown } | undefined) => {
            if (entity !== Enrollment || typeof criteria?.status !== 'string') return { affected: 1 };
            const reads = enrollmentRepo.findOne!.mock.results;
            const row = reads.length > 0 ? ((await reads[reads.length - 1].value) as { status?: unknown } | null) : null;
            return { affected: row?.status === criteria.status ? 1 : 0 };
        });
        // The group's coming classes, which the capacity check reads with SQL: none unless a test
        // says so, and then the group's own capacity is the whole question.
        manager.query = jest.fn().mockResolvedValue([]);
        audit = { record: jest.fn() };

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
                // E11/S3: going past a group's capacity is the one decision here that leaves a row
                // in the audit log. Mocked, because what this suite asserts is that it is written
                // at all and with the seats in it — the writing itself is E07/S3's own suite.
                { provide: AuditService, useValue: audit },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(EnrollmentService);
    });

    /** The body of a thrown Nest exception, which is where the stable error code lives. */
    const responseOf = (error: unknown) => (error as ConflictException).getResponse() as { error?: string; message?: string };

    describe('enrol', () => {
        it('opens an ACTIVE enrolment by default, starting today', async () => {
            await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' });

            expect(manager.save).toHaveBeenCalledWith(
                Enrollment,
                expect.objectContaining({ status: EnrollmentStatus.ACTIVE, endDate: null, startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
            );
        });

        it('writes Child.group in the same transaction, so the derived column cannot lag', async () => {
            enrollmentRepo.findOne!.mockResolvedValueOnce(null).mockResolvedValue({ id: 99, group: { id: 2 } });

            await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' });

            // Six queries still read this column, two of them security-relevant. It is derived, so
            // it has exactly one writer, and that writer runs inside the transaction that justifies
            // the value.
            expect(manager.update).toHaveBeenCalledWith(Child, { id: 1 }, { group: { id: 2 } });
        });

        it('refuses a second enrolment while one is in force, naming the group', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ id: 7, group: { id: 3, name: 'Python Începători' } });

            // D6: a child is in one group. The message names the other group, because "already
            // enrolled" without saying where is a message that sends an admin looking.
            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('CHILD_ALREADY_ENROLLED');
            expect(responseOf(error).message).toContain('Python Începători');
        });

        it('counts a booked trial as a seat taken', async () => {
            // D7, the rule easiest to get wrong: a group of ten with nine enrolled and one trial is
            // full. `countInForce` is what has to include trials, and this says so.
            enrollmentRepo.count!.mockResolvedValue(10);

            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('GROUP_FULL');
        });

        it('offers the waiting list in the refusal, because that is the next thing to do', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).message).toContain('lista de așteptare');
        });

        /**
         * The review of 25 September 2026: the group's ten seats are not the whole question. A class
         * of it can hold a child moved in for the week, or have moved into a smaller room, and the
         * child being enrolled sits in that class too.
         */
        it('refuses the last seat of the group when one of its coming classes is already full', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            manager.query!.mockResolvedValue([
                { date: '2026-10-01', roomCapacity: 10, visitors: 1 },
                { date: '2026-10-08', roomCapacity: 10, visitors: 0 },
            ]);

            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);

            expect(responseOf(error).error).toBe('GROUP_FULL');
            // The message names the class, since the group itself still shows a free seat.
            expect(responseOf(error).message).toContain('joi, 1 octombrie');
            expect(manager.save).not.toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('counts a class moved into a smaller room by that room', async () => {
            enrollmentRepo.count!.mockResolvedValue(6);
            manager.query!.mockResolvedValue([{ date: '2026-10-01', roomCapacity: 6, visitors: 0 }]);

            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);

            expect(responseOf(error).error).toBe('GROUP_FULL');
        });

        it('asks about the classes from the day the enrolment starts', async () => {
            await service.enrol({ childId: 1, groupId: 2, startDate: '2026-11-02' }, { userId: 42, username: 'admin' });

            expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('class_sessions'), [2, '2026-11-02', ClassSessionStatus.SCHEDULED, 1]);
        });

        it('enrols when every coming class has room for one more', async () => {
            enrollmentRepo.count!.mockResolvedValue(8);
            manager.query!.mockResolvedValue([{ date: '2026-10-01', roomCapacity: 10, visitors: 1 }]);

            await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' });

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('lets an admin over capacity only when they ask for it explicitly', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.enrol({ childId: 1, groupId: 2, allowOverCapacity: true }, { userId: 42, username: 'admin' });

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('writes the override into the audit log, on the group and in the same transaction', async () => {
            // E11/S3's last open clause. The subject is the group because that is what the question
            // is about — "who put an eleventh child in here" — and the manager is the transaction's,
            // so a record of a seat that rolled back cannot survive the seat.
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.enrol({ childId: 1, groupId: 2, allowOverCapacity: true }, { userId: 42, username: 'admin' });

            expect(audit.record).toHaveBeenCalledWith(
                {
                    actor: { userId: 42, username: 'admin' },
                    action: AuditAction.UPDATED,
                    entityType: 'Group',
                    entityId: 2,
                    changes: { seatsTaken: { from: 10, to: 11 } },
                    note: 'Înscriere peste capacitate: 11 copii în 10 locuri.',
                },
                manager,
            );
        });

        it('names the class in the note when a class, not the group, had no seat left', async () => {
            enrollmentRepo.count!.mockResolvedValue(1);
            manager.query!.mockResolvedValue([{ date: '2026-10-01', roomCapacity: 2, visitors: 1 }]);

            await service.enrol({ childId: 1, groupId: 2, allowOverCapacity: true }, { userId: 42, username: 'admin' });

            // The group had seats to spare, so "over capacity" would be the wrong sentence.
            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({ note: 'Înscriere peste locurile orei din 2026-10-01: 3 copii în 2 locuri.' }),
                manager,
            );
        });

        it('says so when the override came from no account at all', async () => {
            // Nothing public sends `allowOverCapacity`, so this branch is unreachable from the trial
            // form today. The entry is written for the day somebody adds a second public road: an
            // empty username is the shape a scheduled job leaves too, and only the note tells them
            // apart.
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.enrol({ childId: 1, groupId: 2, allowOverCapacity: true }, null);

            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: { userId: null, username: null },
                    note: 'Înscriere peste capacitate: 11 copii în 10 locuri, din formularul public.',
                }),
                manager,
            );
        });

        it('writes nothing to the audit log for an ordinary enrolment', async () => {
            // The trail is for the exception. A row per enrolment would bury the eleven-in-ten one
            // in the middle of every ordinary September.
            await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' });

            expect(audit.record).not.toHaveBeenCalled();
        });

        it('refuses a child whose family account is still waiting', async () => {
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { ...child.parent, user: { ...activeParent, emailConfirmedAt: null } } });

            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('PARENT_ACCOUNT_NOT_ACTIVE');
        });

        it('enrols a child whose family has no account at all', async () => {
            // The admin-typed-it-in-from-a-phone-call flow. Nothing to confirm, nobody to approve.
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { id: 10, user: null } });

            await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' });

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('refuses when the family has an account but has not finished step two of registration', async () => {
            // Registration is two required steps since E11/S2; a child cannot sit in a room while
            // the school has no phone number and no emergency contact for them.
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { ...child.parent, emergencyContactPhone: null } });

            await expect(service.enrol({ childId: 1, groupId: 2 }, { userId: 1, username: 'admin' })).rejects.toMatchObject({
                response: { error: 'PARENT_PROFILE_INCOMPLETE' },
            });
        });

        it('says the profile is incomplete rather than that the account is inactive — they are repaired by different people', async () => {
            childRepo.findOne!.mockResolvedValue({ ...child, parent: { ...child.parent, phone: null } });

            await expect(service.enrol({ childId: 1, groupId: 2 }, { userId: 1, username: 'admin' })).rejects.toMatchObject({
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

            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('GROUP_INACTIVE');
        });

        it('refuses to open an enrolment in a closed status', async () => {
            await expect(service.enrol({ childId: 1, groupId: 2, status: EnrollmentStatus.COMPLETED }, { userId: 42, username: 'admin' })).rejects.toThrow(
                BadRequestException,
            );
        });

        it('settles any waitlist request the child had for that group', async () => {
            await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' });

            // Left open, the family would keep a place in a queue for a seat they are sitting in.
            expect(waitlistRepo.update).toHaveBeenCalledWith(expect.objectContaining({ child: { id: 1 } }), { status: WaitlistStatus.ACCEPTED });
        });

        it('404s on a child that does not exist', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.enrol({ childId: 99, groupId: 2 }, { userId: 42, username: 'admin' })).rejects.toThrow(NotFoundException);
        });

        it('404s on a group that does not exist', async () => {
            groupRepo.findOne!.mockResolvedValue(null);
            await expect(service.enrol({ childId: 1, groupId: 99 }, { userId: 42, username: 'admin' })).rejects.toThrow(NotFoundException);
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
                // Only while it is still in force: two presses must not both release the seat.
                { id: 9, status: EnrollmentStatus.ACTIVE },
                { status: EnrollmentStatus.WITHDRAWN, exitReason: 'S-a mutat din oraș', endDate: expect.any(String) },
            );
        });

        /** The review of 25 September 2026: the trial's own class stays off the bill once it is decided. */
        it('records on a trial the day it stopped being one', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...inForce, status: EnrollmentStatus.TRIAL });

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN, endDate: '2026-01-05' });

            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9, status: EnrollmentStatus.TRIAL },
                expect.objectContaining({ status: EnrollmentStatus.WITHDRAWN, endDate: '2026-01-05', trialUntil: '2026-01-05' }),
            );
        });

        /** Read as a trial, accepted by somebody else before the lock: closed as the active row it is. */
        it('decides what the row was under the lock, not from the read before it', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...inForce, status: EnrollmentStatus.TRIAL });
            manager.update.mockImplementation((entity: unknown, criteria: { status?: unknown }) =>
                Promise.resolve({ affected: entity === Enrollment && criteria.status === EnrollmentStatus.TRIAL ? 0 : 1 }),
            );

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9, status: EnrollmentStatus.ACTIVE },
                expect.not.objectContaining({ trialUntil: expect.anything() }),
            );
            expect(leadProgress.settleForEnrollment).not.toHaveBeenCalled();
        });

        /** The second press of "close", arriving while the first held the group. */
        it('refuses when the enrolment closed between the read and the write', async () => {
            manager.update.mockImplementation((entity: unknown) => Promise.resolve({ affected: entity === Enrollment ? 0 : 1 }));

            const error = await service.close(9, { status: EnrollmentStatus.WITHDRAWN }).catch((e: unknown) => e);

            expect(responseOf(error).error).toBe('ENROLLMENT_ALREADY_CLOSED');
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        /** The review of 25 September 2026: a date ahead would free the seat today, with the child still in it. */
        it('refuses an end date ahead, and writes nothing', async () => {
            const error = await service.close(9, { status: EnrollmentStatus.WITHDRAWN, endDate: '2999-01-01' }).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect(responseOf(error).error).toBe('ENROLLMENT_END_IN_FUTURE');
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('accepts today as the end date, and a day already past', async () => {
            await service.close(9, { status: EnrollmentStatus.WITHDRAWN, endDate: schoolToday() });
            await service.close(9, { status: EnrollmentStatus.WITHDRAWN, endDate: '2026-01-05' });

            expect(manager.update).toHaveBeenCalledWith(Enrollment, expect.anything(), expect.objectContaining({ endDate: '2026-01-05' }));
        });

        /** A trial closed here came to nothing, as surely as one closed through `resolveTrial`. */
        it('settles a trial’s lead as lost, with the reason given', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...inForce, status: EnrollmentStatus.TRIAL });

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN, exitReason: 'Nu a mai venit' });

            expect(leadProgress.settleForEnrollment).toHaveBeenCalledWith(9, { enrolled: false, reason: 'Nu a mai venit' }, expect.any(Date), manager);
        });

        it('leaves the leads alone when the enrolment closed was not a trial', async () => {
            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(leadProgress.settleForEnrollment).not.toHaveBeenCalled();
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
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 4,
                    child: { firstName: 'Vlad', parent: { email: 'parinte@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(manager.update).toHaveBeenCalledWith(
                WaitlistEntry,
                { id: 4 },
                expect.objectContaining({ status: WaitlistStatus.OFFERED, respondBy: expect.any(Date) }),
            );
            // In the same transaction as the release: an offer that survives the process dying
            // between the two writes is the only version of "within a minute" that holds.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith(
                { email: 'parinte@example.com' },
                expect.objectContaining({ subject: expect.any(String) }),
                manager,
            );
        });

        /** Every free seat, one family each — the list asked for as many as there are seats. */
        it('asks the list for as many families as there are free seats', async () => {
            enrollmentRepo.count!.mockResolvedValue(7);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(waitlistRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { group: { id: 2 }, status: WaitlistStatus.WAITING }, take: 3 }));
        });

        it('puts the group and a real deadline in the offer, because the list is a promise', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 4,
                    child: { firstName: 'Vlad', parent: { email: 'parinte@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            const [[, offer]] = outbox.queueOrRecord.mock.calls as [[unknown, { bodyText: string }]];
            expect(offer.bodyText).toContain('Scratch Începători');

            const update = manager.update.mock.calls.find((call) => call[0] === WaitlistEntry);
            const respondBy = (update?.[2] as { respondBy: Date }).respondBy;
            expect(respondBy.getTime()).toBeGreaterThan(Date.now() + (WAITLIST_RESPONSE_HOURS - 1) * 3_600_000);
        });

        it('offers nothing when the group is still full', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        /** A seat offered to somebody else is not free, so it is not offered twice. */
        it('offers nothing while the only free seat is already offered to a family', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.count!.mockImplementation(({ where }: { where: { status: unknown } }) =>
                Promise.resolve(where.status === WaitlistStatus.OFFERED ? 1 : 2),
            );

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(waitlistRepo.find).not.toHaveBeenCalled();
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('offers nothing when nobody is waiting', async () => {
            enrollmentRepo.count!.mockResolvedValue(5);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        /** An inactive group refuses the enrolment the offer would lead to (`GROUP_INACTIVE`). */
        it('offers nothing in an inactive group', async () => {
            groupRepo.findOne!.mockResolvedValue(group({ isActive: false }));
            enrollmentRepo.count!.mockResolvedValue(5);
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 4,
                    child: { firstName: 'Vlad', parent: { email: 'parinte@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('still offers the seat when the family has no email, and records that the offer went nowhere', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 4,
                    child: { firstName: 'Vlad', parent: { email: null } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            // The seat is theirs and the clock runs; somebody has to phone. Skipping to the next
            // family would quietly punish the one the school entered from a phone call — and the
            // row `queueOrRecord` leaves is what tells the office to (E17/S5).
            expect(manager.update).toHaveBeenCalledWith(WaitlistEntry, { id: 4 }, expect.objectContaining({ status: WaitlistStatus.OFFERED }));
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.objectContaining({ subject: expect.any(String) }), manager);
        });

        /**
         * The lock has to come **before** the number it protects — the fourth time, and the same
         * two lines every time.
         *
         * `enrol` locks the group and then counts, so an enrolment taking the last seat commits
         * while this read its own snapshot and saw the seat free. The waiting family was then
         * promised a chair for 48 hours that a child was already sitting in — the one outcome the
         * list exists to prevent. Asserted on call order rather than by racing two transactions:
         * what went wrong is the order of two lines, and that is a thing a unit test can hold
         * still.
         */
        it('locks the group before it counts the seats, not after', async () => {
            const order: string[] = [];
            const lockGroup = jest.spyOn(service, 'lockGroup').mockImplementation((_manager, groupId) => {
                order.push('lock');
                return Promise.resolve(group({ id: groupId }) as Group);
            });
            jest.spyOn(service, 'occupancyOf').mockImplementation((groupId) => {
                order.push('count');
                return Promise.resolve({ groupId, capacity: 10, taken: 9, held: 0, free: 1, waiting: 1 });
            });
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 4,
                    child: { firstName: 'Vlad', parent: { email: 'parinte@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            // Twice: `close` takes it before writing the enrolment, `offerFreeSeats` again beside the
            // count it protects — a no-op the second time in one transaction.
            expect(order).toEqual(['lock', 'lock', 'count']);
            expect(lockGroup).toHaveBeenCalledWith(manager, 2);
        });

        it('clears Child.group when the last enrolment closes', async () => {
            enrollmentRepo.findOne!.mockResolvedValueOnce(inForce).mockResolvedValue(null);

            await service.close(9, { status: EnrollmentStatus.WITHDRAWN });

            expect(manager.update).toHaveBeenCalledWith(Child, { id: 1 }, { group: null });
        });
    });

    describe('occupancyOf', () => {
        it('reports free seats as capacity minus everything in force and every seat offered', async () => {
            enrollmentRepo.count!.mockResolvedValue(7);
            waitlistRepo.count!.mockImplementation(({ where }: { where: { status: unknown } }) =>
                Promise.resolve(where.status === WaitlistStatus.OFFERED ? 1 : 3),
            );

            await expect(service.occupancyOf(2)).resolves.toEqual({ groupId: 2, capacity: 10, taken: 7, held: 1, free: 2, waiting: 3 });
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
            // The entry being removed; then the next one in the queue — `removeFromWaitlist` re-runs
            // the offer, which is the whole point of declining.
            waitlistRepo.findOne!.mockResolvedValue({ id: 4, status: WaitlistStatus.OFFERED, group: { id: 2 } });
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 5,
                    child: { firstName: 'Ioana', parent: { email: 'urmatorul@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);
            enrollmentRepo.count!.mockResolvedValue(9);

            await service.removeFromWaitlist(4, WaitlistStatus.DECLINED);

            // Only while it is still on the list: the sweep may have moved it first.
            expect(manager.update).toHaveBeenCalledWith(
                WaitlistEntry,
                { id: 4, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) },
                { status: WaitlistStatus.DECLINED },
            );
            expect(manager.update).toHaveBeenCalledWith(WaitlistEntry, { id: 5 }, expect.objectContaining({ status: WaitlistStatus.OFFERED }));
            expect(outbox.queueOrRecord).toHaveBeenCalledWith(
                { email: 'urmatorul@example.com' },
                expect.objectContaining({ subject: expect.any(String) }),
                manager,
            );
        });

        /**
         * The decline and the sweep, together. Whichever writes second finds the row already
         * settled and must change nothing — not the status the family gave, not a second offer.
         */
        it('refuses an entry that left the list before this write, and hands nothing on', async () => {
            waitlistRepo.findOne!.mockResolvedValue({ id: 4, status: WaitlistStatus.OFFERED, group: { id: 2 } });
            manager.update.mockResolvedValue({ affected: 0 });

            const error = await service.removeFromWaitlist(4, WaitlistStatus.DECLINED).catch((e: unknown) => e);

            expect(responseOf(error).error).toBe('WAITLIST_ENTRY_CLOSED');
            expect(waitlistRepo.find).not.toHaveBeenCalled();
        });

        /**
         * The other path where the lock was hoisted ahead of the entry write, and the one that had
         * no test — so removing the hoist, or the `if (releasesSeat)` around it, turned nothing red.
         *
         * Same cycle as the sweep's: `enrol` takes the group and *then* settles that child's
         * waiting rows, so a decline that wrote the row first and asked for the group second would
         * sit head-to-head with an enrolment holding the group and waiting on the row.
         */
        it('locks the group before it touches the entry', async () => {
            waitlistRepo.findOne!.mockResolvedValueOnce({ id: 4, status: WaitlistStatus.OFFERED, group: { id: 2 } }).mockResolvedValue(null);
            enrollmentRepo.count!.mockResolvedValue(9);

            const order: string[] = [];
            jest.spyOn(service, 'lockGroup').mockImplementation((_manager, groupId) => {
                order.push('lock');
                return Promise.resolve(group({ id: groupId }) as Group);
            });
            manager.update.mockImplementation((entity: unknown) => {
                if (entity === WaitlistEntry) order.push('decline');
                return Promise.resolve({ affected: 1 });
            });

            await service.removeFromWaitlist(4, WaitlistStatus.DECLINED);

            // A third entry follows — `offerFreeSeats` re-taking the same lock, a no-op here.
            expect(order.slice(0, 2)).toEqual(['lock', 'decline']);
        });

        it('offers nothing when the entry was merely waiting and the group is full', async () => {
            waitlistRepo.findOne!.mockResolvedValue({ id: 4, status: WaitlistStatus.WAITING, group: { id: 2 } });
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.removeFromWaitlist(4);

            // Nothing was released, so there is no seat to hand on: the count finds none free.
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
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
            // The lapsed offers first, then the head of the list — `find` answers both questions.
            waitlistRepo.find!.mockResolvedValueOnce([lapsed]).mockResolvedValue([
                {
                    id: 5,
                    child: { firstName: 'Ana', parent: { email: 'urmatorul@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);
            // A seat is free once the lapsed entry stops holding it, and somebody is next in line.
            enrollmentRepo.count!.mockResolvedValue(9);
            const now = new Date('2026-03-02T09:00:00Z');

            const result = await service.expireLapsedOffers(now);

            expect(result).toEqual({ expired: 1 });
            // Only while it is still the unanswered offer the list read.
            expect(manager.update).toHaveBeenCalledWith(
                WaitlistEntry,
                { id: 4, status: WaitlistStatus.OFFERED, respondBy: LessThan(now) },
                { status: WaitlistStatus.EXPIRED },
            );
            // The family whose offer lapsed: the last thing the school told them was that they had
            // a seat until Thursday, and that has stopped being true.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: 'parinte@example.com' }, expect.any(Object), manager);
            // And the next family, through the same door a decline goes through.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: 'urmatorul@example.com' }, expect.any(Object), manager);
        });

        /**
         * The family answered between the sweep's list and its write. Their "no" used to be
         * overwritten as "expired", they were mailed that they had missed the seat, and the seat
         * was offered a second time.
         */
        it('leaves an offer alone that was answered after the list was read', async () => {
            waitlistRepo.find!.mockResolvedValueOnce([lapsed]);
            enrollmentRepo.count!.mockResolvedValue(9);
            manager.update.mockImplementation((entity: unknown) => Promise.resolve({ affected: entity === WaitlistEntry ? 0 : 1 }));

            const result = await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'));

            expect(result).toEqual({ expired: 0 });
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('leaves a record rather than skipping a family with no address', async () => {
            waitlistRepo.find!.mockResolvedValueOnce([{ ...lapsed, child: { firstName: 'Vlad', parent: { email: null } } }]);
            enrollmentRepo.count!.mockResolvedValue(10);

            await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'));

            // They are the family who most needs the phone call, so the row has to exist.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.any(Object), manager);
        });

        it('still expires the entry when nobody is waiting behind it', async () => {
            waitlistRepo.find!.mockResolvedValueOnce([lapsed]);
            enrollmentRepo.count!.mockResolvedValue(9);
            const now = new Date('2026-03-02T09:00:00Z');

            const result = await service.expireLapsedOffers(now);

            // The seat going back to the group is the point; an empty queue does not make the stale
            // offer worth keeping.
            expect(result).toEqual({ expired: 1 });
            expect(manager.update).toHaveBeenCalledWith(
                WaitlistEntry,
                { id: 4, status: WaitlistStatus.OFFERED, respondBy: LessThan(now) },
                { status: WaitlistStatus.EXPIRED },
            );
        });

        /**
         * The sweep takes the group **before** it takes the entry, which is a lock-order rule and
         * not a second copy of the one above.
         *
         * `enrol` locks the group and then settles that child's waitlist rows. A sweep that wrote
         * the entry first and asked for the group second could therefore meet an enrolment
         * head-on — each holding what the other was waiting for, and Postgres killing one of them.
         * Same lock, same order, no cycle.
         */
        it('locks the group before it touches the entry', async () => {
            waitlistRepo.find!.mockResolvedValueOnce([lapsed]);
            enrollmentRepo.count!.mockResolvedValue(9);

            const order: string[] = [];
            jest.spyOn(service, 'lockGroup').mockImplementation((_manager, groupId) => {
                order.push('lock');
                return Promise.resolve(group({ id: groupId }) as Group);
            });
            manager.update.mockImplementation((entity: unknown) => {
                if (entity === WaitlistEntry) order.push('expire');
                return Promise.resolve({ affected: 1 });
            });

            await service.expireLapsedOffers(new Date('2026-03-02T09:00:00Z'));

            // The third entry is `offerFreeSeats` taking the same lock again, a no-op in this
            // transaction. What this pins is the first two.
            expect(order.slice(0, 2)).toEqual(['lock', 'expire']);
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
            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            // Either way round without the transaction gives two live enrolments or a child with
            // none — and at capacity, a seat that frees before the transfer completes.
            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                // Only while it is still in force: it was read before the locks.
                { id: 9, status: EnrollmentStatus.ACTIVE },
                expect.objectContaining({ status: EnrollmentStatus.TRANSFERRED, endDate: expect.any(String) }),
            );
            expect(manager.save).toHaveBeenCalledWith(
                Enrollment,
                expect.objectContaining({ group: { id: 2 }, endDate: null, status: EnrollmentStatus.ACTIVE }),
            );
        });

        /**
         * The one transaction that holds two groups. Two transfers in opposite directions each
         * locking the group they join first would each hold what the other waits for.
         */
        it('locks both groups, the lower id first, before it writes anything', async () => {
            const order: string[] = [];
            jest.spyOn(service, 'lockGroup').mockImplementation((_manager, groupId) => {
                order.push(`lock ${groupId}`);
                return Promise.resolve(group({ id: groupId }) as Group);
            });
            manager.update.mockImplementation((entity: unknown) => {
                if (entity === Enrollment) order.push('close');
                return Promise.resolve({ affected: 1 });
            });

            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(order.slice(0, 3)).toEqual(['lock 2', 'lock 3', 'close']);
        });

        /** Enrolled into the group, the child's own request for it is settled — as in `enrol`. */
        it('settles the request the child had for the group it moves into', async () => {
            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(waitlistRepo.update).toHaveBeenCalledWith(
                { child: { id: 1 }, group: { id: 2 }, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) },
                { status: WaitlistStatus.ACCEPTED },
            );
        });

        /** Their own offer is the seat they take, not a seat in their way. */
        it('does not count the child’s own offer in the destination against them', async () => {
            enrollmentRepo.count!.mockResolvedValue(9);
            waitlistRepo.count!.mockResolvedValue(0);

            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(waitlistRepo.count).toHaveBeenCalledWith({
                where: { group: { id: 2 }, status: WaitlistStatus.OFFERED, child: { id: expect.anything() } },
            });
        });

        it('carries the status across, so a trial that moves is still a trial', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...current, status: EnrollmentStatus.TRIAL });

            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            // Promoting it here would enrol a family that has not decided yet.
            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.objectContaining({ status: EnrollmentStatus.TRIAL }));
            // And the row it leaves stopped being a trial today: its class is not billed there.
            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9, status: EnrollmentStatus.TRIAL },
                expect.objectContaining({ status: EnrollmentStatus.TRANSFERRED, trialUntil: schoolToday() }),
            );
        });

        /** Read as a trial, accepted before the locks: it moves as the enrolment it has become. */
        it('carries across what the row was under the lock, not what the read said', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...current, status: EnrollmentStatus.TRIAL });
            manager.update.mockImplementation((entity: unknown, criteria: { status?: unknown }) =>
                Promise.resolve({ affected: entity === Enrollment && criteria.status === EnrollmentStatus.TRIAL ? 0 : 1 }),
            );

            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.objectContaining({ status: EnrollmentStatus.ACTIVE }));
            expect(leadProgress.followTransfer).not.toHaveBeenCalled();
        });

        /** The review of 25 September 2026: the lead hangs off the row E11 will decide on, which is now the new one. */
        it('moves a trial’s lead onto the new enrolment and group, in the transaction', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...current, status: EnrollmentStatus.TRIAL });

            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(leadProgress.followTransfer).toHaveBeenCalledWith(9, { enrollmentId: 99, groupId: 2 }, expect.any(Date), manager);
        });

        it('leaves the leads alone when an active enrolment moves', async () => {
            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(leadProgress.followTransfer).not.toHaveBeenCalled();
        });

        it('carries the signed contract across, because it is the same enrolment continuing', async () => {
            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.objectContaining({ contractSignedAt: '2026-01-01' }));
        });

        it('names the destination in the exit reason when nobody gives one', async () => {
            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            const update = manager.update.mock.calls.find((call) => call[0] === Enrollment);
            expect((update?.[2] as { exitReason: string }).exitReason).toContain('Scratch Începători');
        });

        it('refuses when there is nothing to transfer from', async () => {
            enrollmentRepo.findOne!.mockResolvedValue(null);

            const error = await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('NOTHING_TO_TRANSFER');
        });

        it('refuses a transfer into the group the child is already in', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...current, group: { id: 2, name: 'Scratch Începători' } });

            const error = await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('ALREADY_IN_GROUP');
        });

        it('checks capacity on the destination', async () => {
            enrollmentRepo.count!.mockResolvedValue(10);

            const error = await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('GROUP_FULL');
        });

        /**
         * The seat the child leaves is free — they sit in the other group now. This used to say it
         * was "handed to this child", which is true of no seat, and the old group's list was never
         * told.
         */
        it('offers the seat it leaves behind to that group’s queue', async () => {
            enrollmentRepo.count!.mockResolvedValue(5);
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 4,
                    child: { firstName: 'Vlad', parent: { email: 'x@example.com' } },
                    group: { id: 3, name: 'Python' },
                },
            ]);

            await service.transfer({ childId: 1, toGroupId: 2 }, { userId: 42, username: 'admin' });

            expect(waitlistRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { group: { id: 3 }, status: WaitlistStatus.WAITING } }));
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: 'x@example.com' }, expect.objectContaining({ subject: expect.any(String) }), manager);
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

            // Only while it is still a trial: a decision made twice at once must not count twice. And
            // the day it stopped being one goes on the row, or its class would reach the bill.
            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9, status: EnrollmentStatus.TRIAL },
                expect.objectContaining({ status: EnrollmentStatus.ACTIVE, trialUntil: schoolToday() }),
            );
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('frees the seat and runs the queue when the family does not continue', async () => {
            enrollmentRepo.count!.mockResolvedValue(5);
            waitlistRepo.find!.mockResolvedValue([
                {
                    id: 4,
                    child: { firstName: 'Vlad', parent: { email: 'x@example.com' } },
                    group: { id: 2, name: 'Scratch Începători' },
                },
            ]);

            await service.resolveTrial(9, { accepted: false, reason: 'Nu s-a potrivit programul' });

            expect(manager.update).toHaveBeenCalledWith(
                Enrollment,
                { id: 9, status: EnrollmentStatus.TRIAL },
                expect.objectContaining({ status: EnrollmentStatus.WITHDRAWN, exitReason: 'Nu s-a potrivit programul', trialUntil: schoolToday() }),
            );
            expect(outbox.queueOrRecord).toHaveBeenCalled();
        });

        it('refuses a trial decided by somebody else between the read and the write', async () => {
            manager.update.mockImplementation((entity: unknown) => Promise.resolve({ affected: entity === Enrollment ? 0 : 1 }));

            const error = await service.resolveTrial(9, { accepted: false }).catch((e: unknown) => e);

            expect(responseOf(error).error).toBe('NOT_A_TRIAL');
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
            expect(leadProgress.settleForEnrollment).not.toHaveBeenCalled();
        });

        it('refuses to resolve something that is not a trial', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...trial, status: EnrollmentStatus.ACTIVE });

            const error = await service.resolveTrial(9, { accepted: true }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('NOT_A_TRIAL');
        });
    });

    describe('contract evidence (E07 S8)', () => {
        const active = { id: 12, status: EnrollmentStatus.ACTIVE, child: { id: 1 }, group: { id: 2 }, contractSignedAt: null };

        beforeEach(() => {
            enrollmentRepo.findOne!.mockResolvedValue(active);
            enrollmentRepo.findOneOrFail!.mockResolvedValue({ ...active, contractSignedAt: '2026-01-14' });
            enrollmentRepo.update!.mockResolvedValue({ affected: 1 });
        });

        it('records the day the paper was signed, and hands back the row', async () => {
            const saved = await service.recordContract(12, '2026-01-14');

            expect(enrollmentRepo.update).toHaveBeenCalledWith({ id: 12 }, { contractSignedAt: '2026-01-14' });
            expect(saved.contractSignedAt).toBe('2026-01-14');
        });

        it('keeps only the day of a full timestamp', async () => {
            await service.recordContract(12, '2026-01-14T10:30:00.000Z');

            expect(enrollmentRepo.update).toHaveBeenCalledWith({ id: 12 }, { contractSignedAt: '2026-01-14' });
        });

        it('clears a mistaken entry with null', async () => {
            await service.recordContract(12, null);

            expect(enrollmentRepo.update).toHaveBeenCalledWith({ id: 12 }, { contractSignedAt: null });
        });

        it('refuses a trial — there is no contract to have signed yet', async () => {
            enrollmentRepo.findOne!.mockResolvedValue({ ...active, status: EnrollmentStatus.TRIAL });

            const error = await service.recordContract(12, '2026-01-14').catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ConflictException);
            expect(responseOf(error).error).toBe('TRIAL_HAS_NO_CONTRACT');
            expect(enrollmentRepo.update).not.toHaveBeenCalled();
        });

        it('refuses a day in the future', async () => {
            const error = await service.recordContract(12, '2999-01-01').catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect(responseOf(error).error).toBe('CONTRACT_DATE_IN_FUTURE');
        });

        it('404s an enrolment that does not exist', async () => {
            enrollmentRepo.findOne!.mockResolvedValue(null);

            await expect(service.recordContract(99, '2026-01-14')).rejects.toThrow(NotFoundException);
        });

        it('lists only active, open enrolments with nothing on file, oldest first', async () => {
            const qb = createMockQueryBuilder({ many: [active] });
            enrollmentRepo.createQueryBuilder!.mockReturnValue(qb);

            const rows = await service.withoutContract();

            expect(rows).toEqual([active]);
            expect(qb.where).toHaveBeenCalledWith('enrollment.status = :status', { status: EnrollmentStatus.ACTIVE });
            expect(qb.andWhereCalls.map(([condition]) => condition)).toEqual(['enrollment.endDate IS NULL', 'enrollment.contractSignedAt IS NULL']);
            expect(qb.orderBy).toHaveBeenCalledWith('enrollment.startDate', 'ASC');
        });
    });

    describe('compatibility (S6)', () => {
        it('refuses once with the ages named, and accepts on the retry', async () => {
            const sevenYearOld = { ...child, birthDate: `${new Date().getFullYear() - 7}-01-01` };
            childRepo.findOne!.mockResolvedValue(sevenYearOld);
            groupRepo.findOne!.mockResolvedValue(group({ minAge: 11, maxAge: 14 }));

            // A warning has to mean something: an admin enrolling a seven-year-old in an 11-14
            // group should have had to see that and say yes.
            const error = await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' }).catch((e: unknown) => e);
            expect(responseOf(error).error).toBe('COMPATIBILITY_WARNINGS');
            expect(responseOf(error).message).toContain('11-14');

            await service.enrol({ childId: 1, groupId: 2, acknowledgeWarnings: true }, { userId: 42, username: 'admin' });
            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('says nothing when the age fits', async () => {
            await service.enrol({ childId: 1, groupId: 2 }, { userId: 42, username: 'admin' });

            expect(manager.save).toHaveBeenCalledWith(Enrollment, expect.anything());
        });

        it('is a warning, not a block — unlike capacity', async () => {
            const sevenYearOld = { ...child, birthDate: `${new Date().getFullYear() - 7}-01-01` };
            childRepo.findOne!.mockResolvedValue(sevenYearOld);
            groupRepo.findOne!.mockResolvedValue(group({ minAge: 11, maxAge: 14, capacity: 10 }));
            enrollmentRepo.count!.mockResolvedValue(10);

            // Capacity is checked first and refuses outright: acknowledging warnings must not be a
            // way past a full room, because an eleventh chair is not a judgement call.
            const error = await service
                .enrol({ childId: 1, groupId: 2, acknowledgeWarnings: true }, { userId: 42, username: 'admin' })
                .catch((e: unknown) => e);
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
