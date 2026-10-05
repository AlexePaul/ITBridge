import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChildService } from './child.service';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Group } from 'src/entities/group.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { Project } from 'src/entities/project.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Role } from 'src/enum/role.enum';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { In } from 'typeorm';
import { PublicationConsentService } from 'src/modules/privacy/publication-consent.service';
import { AuditService } from 'src/modules/audit/audit.service';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import {
    MockEntityManager,
    MockRepository,
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';

/** The admin the audit log would store: the id, and the username copied at write time. */
const ADMIN = { userId: 42, username: 'admin' };

describe('ChildService', () => {
    /** E07/S3. Field names reach the trail; values never do. */
    let audit: { recordPersonalDataChange: jest.Mock };

    /** Whoever pressed the button, in the shape `actorFrom` hands over. */
    const ACTOR = { userId: 5, username: 'ana' };
    let service: ChildService;
    let childRepo: MockRepository;
    let profileRepo: MockRepository;
    let groupRepo: MockRepository;
    let attendanceRepo: MockRepository;
    let projectRepo: MockRepository;
    let enrollmentRepo: MockRepository;
    let waitlistRepo: MockRepository;
    /** A deleted child's consent is announced to the office, as at an erasure — E07/S2. */
    let consents: { announceErasure: jest.Mock };
    /** The transaction each write opens: the row and its audit trail share it — E07/S3. */
    let manager: MockEntityManager;
    let enrollments: Record<string, jest.Mock>;

    /** A child of the parent whose account is `ownerUserId`. */
    const childOwnedBy = (ownerUserId: number) => ({
        id: 1,
        parent: { id: 10, user: { id: ownerUserId } },
    });

    beforeEach(async () => {
        childRepo = createMockRepository();
        profileRepo = createMockRepository();
        groupRepo = createMockRepository();
        attendanceRepo = createMockRepository();
        projectRepo = createMockRepository();
        enrollmentRepo = createMockRepository();
        waitlistRepo = createMockRepository();
        manager = createMockEntityManager();
        // Nothing recorded against the child unless a test says so: `deleteChild` looks before it
        // deletes, and an unstubbed `exists` returns `undefined`, which reads as "there is nothing".
        attendanceRepo.exists!.mockResolvedValue(false);
        projectRepo.exists!.mockResolvedValue(false);
        enrollmentRepo.exists!.mockResolvedValue(false);
        waitlistRepo.exists!.mockResolvedValue(false);
        consents = { announceErasure: jest.fn().mockResolvedValue(0) };
        enrollments = {
            enrol: jest.fn().mockResolvedValue({ id: 9 }),
            close: jest.fn().mockResolvedValue({ id: 9 }),
            inForceFor: jest.fn().mockResolvedValue(null),
            // A deleted child's seats: taken before the delete, handed on after it.
            lockSeatsHeldBy: jest.fn().mockResolvedValue([]),
            offerFreeSeatsIn: jest.fn().mockResolvedValue(undefined),
        };

        audit = { recordPersonalDataChange: jest.fn(() => Promise.resolve()) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChildService,
                { provide: AuditService, useValue: audit },
                provideMockRepository(Child, childRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockRepository(Group, groupRepo),
                provideMockRepository(Attendance, attendanceRepo),
                provideMockRepository(Project, projectRepo),
                provideMockRepository(Enrollment, enrollmentRepo),
                provideMockRepository(WaitlistEntry, waitlistRepo),
                { provide: EnrollmentService, useValue: enrollments },
                { provide: PublicationConsentService, useValue: consents },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(ChildService);
    });

    describe('createChild', () => {
        it('lets an admin create a child for any parent', async () => {
            profileRepo.findOne!.mockResolvedValue({ erasedAt: null, id: 10 });
            childRepo.create!.mockReturnValue({});
            manager.save.mockResolvedValue({ id: 1 });

            await expect(
                service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.ADMIN, 999, ACTOR),
            ).resolves.toEqual({
                id: 1,
            });
        });

        it('lets a parent create a child on their own profile', async () => {
            profileRepo.findOne!.mockResolvedValue({ erasedAt: null, id: 10 });
            childRepo.create!.mockReturnValue({});
            manager.save.mockResolvedValue({ id: 1 });

            await expect(
                service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5, ACTOR),
            ).resolves.toEqual({
                id: 1,
            });
        });

        it('records the act and the id, never the name that came with it', async () => {
            profileRepo.findOne!.mockResolvedValue({ erasedAt: null, id: 10 });
            childRepo.create!.mockReturnValue({});
            manager.save.mockResolvedValue({ id: 4 });

            await service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.ADMIN, 999, ACTOR);

            // With the transaction's manager: the row and the account of it are one unit of work.
            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, entityType: 'Child', entityId: 4, fields: ['child'] }),
                manager,
            );
            expect(JSON.stringify(audit.recordPersonalDataChange.mock.calls[0][0])).not.toContain('Ion');
        });

        it("forbids a parent from creating a child on someone else's profile", async () => {
            // The authenticated user's profile is 10, but the request targets 11.
            profileRepo.findOne!.mockResolvedValue({ erasedAt: null, id: 10 });

            await expect(
                service.createChild({ parentId: 11, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5, ACTOR),
            ).rejects.toThrow(ForbiddenException);
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('forbids a user without a profile from creating children', async () => {
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(
                service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5, ACTOR),
            ).rejects.toThrow(ForbiddenException);
        });

        /**
         * The school's day, not the server's: 21:30 UTC on the 26th is already the 27th in Bucharest,
         * so a child born that day is born by today, and the 28th is not.
         */
        it('refuses a birth date after the school day, and writes nothing', async () => {
            profileRepo.findOne!.mockResolvedValue({ erasedAt: null, id: 10 });
            childRepo.create!.mockReturnValue({});
            manager.save.mockResolvedValue({ id: 1 });
            const lateEvening = new Date('2026-09-26T21:30:00Z');

            await expect(
                service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2026-09-28' }, Role.PARENT, 5, ACTOR, lateEvening),
            ).rejects.toMatchObject({ response: { error: 'BIRTH_DATE_IN_FUTURE' } });
            expect(manager.save).not.toHaveBeenCalled();

            await expect(
                service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2026-09-27' }, Role.PARENT, 5, ACTOR, lateEvening),
            ).resolves.toEqual({ id: 1 });
        });
    });

    describe('findChildren', () => {
        it('narrows nothing for an ADMIN', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            childRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findChildren({}, Role.ADMIN, 42);

            expect(qb.andWhereCalls.some(([c]) => c.includes('user.id'))).toBe(false);
        });

        it('narrows to the authenticated user for a PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            childRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findChildren({}, Role.PARENT, 42);

            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 42 }]);
        });

        it("a PARENT cannot request another parent's children through a filter", async () => {
            const qb = createMockQueryBuilder({ many: [] });
            childRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findChildren({ parentId: 999 }, Role.PARENT, 42);

            // The requested filter is added, but the user narrowing stays — so the intersection
            // is empty rather than someone else's data.
            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 42 }]);
        });

        /**
         * QA of 27 September 2026: the portal calendar painted "?" on the group's classes from before
         * the child's trial. The calendar needs the day the child's place began, and only the
         * enrolment in force knows it.
         */
        it('sends the first day of each placed child’s enrolment in force, and null without a group', async () => {
            const qb = createMockQueryBuilder({
                many: [
                    { id: 1, group: { id: 3 } },
                    { id: 2, group: null },
                ],
            });
            childRepo.createQueryBuilder!.mockReturnValue(qb);
            enrollmentRepo.find!.mockResolvedValue([{ id: 7, startDate: '2026-09-29', child: { id: 1 } }]);

            const children = await service.findChildren({}, Role.PARENT, 42);

            expect(children).toEqual([expect.objectContaining({ id: 1, groupSince: '2026-09-29' }), expect.objectContaining({ id: 2, groupSince: null })]);
            expect(enrollmentRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({ where: { child: { id: In([1]) }, status: In([EnrollmentStatus.TRIAL, EnrollmentStatus.ACTIVE]) } }),
            );
        });

        it('asks nothing more when no child is in a group', async () => {
            childRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [{ id: 2, group: null }] }));

            await service.findChildren({}, Role.PARENT, 42);

            expect(enrollmentRepo.find).not.toHaveBeenCalled();
        });
    });

    describe('updateChild', () => {
        it('lets a parent update their own child', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            manager.save.mockImplementation((_entity: unknown, c: unknown) => Promise.resolve(c));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.PARENT, 5, ACTOR)).resolves.toMatchObject({
                firstName: 'Ana',
            });
        });

        it('hands back the child without the account it was checked against', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            manager.save.mockImplementation((_entity: unknown, c: unknown) => Promise.resolve(c));

            const saved = await service.updateChild(1, { firstName: 'Ana' }, Role.PARENT, 5, ACTOR);

            // `parent.user` was loaded for the ownership check only. It carries the admin's
            // `rejectionReason`, and carried the password hash before the column was `select: false`.
            expect(saved.parent).toBeDefined();
            expect(saved.parent.user).toBeUndefined();
        });

        it("forbids updating another parent's child", async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.PARENT, 5, ACTOR)).rejects.toThrow(ForbiddenException);
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('lets an admin update any child', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));
            manager.save.mockImplementation((_entity: unknown, c: unknown) => Promise.resolve(c));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.ADMIN, 5, ACTOR)).resolves.toBeDefined();
        });

        it('rejects a child that does not exist', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateChild(99, {}, Role.ADMIN, 5, ACTOR)).rejects.toThrow(NotFoundException);
        });

        it('refuses a birth date corrected to a day after today, and writes nothing', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));

            await expect(service.updateChild(1, { birthDate: '2026-10-01' }, Role.PARENT, 5, ACTOR, new Date('2026-09-26T10:00:00Z'))).rejects.toThrow(
                BadRequestException,
            );
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('forbids a stranger before it judges the date', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));

            await expect(service.updateChild(1, { birthDate: '2026-10-01' }, Role.PARENT, 5, ACTOR, new Date('2026-09-26T10:00:00Z'))).rejects.toThrow(
                ForbiddenException,
            );
        });
    });

    describe('deleteChild', () => {
        it("forbids deleting another parent's child", async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));

            await expect(service.deleteChild(1, Role.PARENT, 5, ACTOR)).rejects.toThrow(ForbiddenException);
            expect(manager.delete).not.toHaveBeenCalled();
        });

        it('lets a parent delete a child who has been nowhere and made nothing', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));

            await expect(service.deleteChild(1, Role.PARENT, 5, ACTOR)).resolves.toMatchObject({ message: expect.any(String) });
            expect(manager.delete).toHaveBeenCalledWith(Child, 1);
        });

        /**
         * A child with no marks can still hold a seat — enrolled, on trial, or offered one — and the
         * cascade frees it without telling the list. The groups are locked before the delete and
         * their lists asked after it, in the delete's transaction.
         */
        it('hands the seats the child held to the waiting lists, around the delete', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            enrollments.lockSeatsHeldBy.mockResolvedValue([2, 7]);
            const order: string[] = [];
            enrollments.lockSeatsHeldBy.mockImplementation(() => {
                order.push('lock');
                return Promise.resolve([2, 7]);
            });
            manager.delete.mockImplementation(() => {
                order.push('delete');
                return Promise.resolve({ affected: 1 });
            });
            enrollments.offerFreeSeatsIn.mockImplementation(() => {
                order.push('offer');
                return Promise.resolve();
            });

            await service.deleteChild(1, Role.ADMIN, 999, ACTOR);

            expect(order).toEqual(['lock', 'delete', 'offer']);
            expect(enrollments.lockSeatsHeldBy).toHaveBeenCalledWith([1], manager);
            expect(enrollments.offerFreeSeatsIn).toHaveBeenCalledWith([2, 7], manager);
        });

        /**
         * `attendances.childId` is CASCADE, so this used to take the register — from a parent's own
         * token. A mark can be corrected; it cannot be made never to have existed.
         */
        it('refuses when the child has been marked, and deletes nothing', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            attendanceRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteChild(1, Role.ADMIN, 999, ACTOR)).rejects.toMatchObject({
                response: { error: 'CHILD_HAS_ATTENDANCE' },
            });
            expect(manager.delete).not.toHaveBeenCalled();
        });

        /** Deleting the rows would leave every object in the bucket with nothing left to name it. */
        it('refuses when the child has saved work, and deletes nothing', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            projectRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteChild(1, Role.ADMIN, 999, ACTOR)).rejects.toMatchObject({
                response: { error: 'CHILD_HAS_PROJECTS' },
            });
            expect(manager.delete).not.toHaveBeenCalled();
        });

        /** The ownership check comes first: a stranger must not learn what a child has done. */
        it('forbids before it explains', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));
            attendanceRepo.exists!.mockResolvedValue(true);
            enrollmentRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteChild(1, Role.PARENT, 5, ACTOR)).rejects.toThrow(ForbiddenException);
        });

        /**
         * Terms §5: only the school enrols, moves or withdraws a child. Deleting an enrolled child from
         * the portal did all three through the cascade, so a parent removes only a row the school has
         * no record of — and hears that before anything about the register.
         */
        it('refuses a parent a child the school has enrolled, even never marked, and deletes nothing', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            enrollmentRepo.exists!.mockResolvedValue(true);
            attendanceRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteChild(1, Role.PARENT, 5, ACTOR)).rejects.toMatchObject({
                response: { error: 'CHILD_HAS_ENROLMENTS' },
            });
            expect(enrollmentRepo.exists).toHaveBeenCalledWith({ where: { child: { id: 1 } } });
            expect(manager.delete).not.toHaveBeenCalled();
        });

        it('refuses a parent a child on a waiting list, and deletes nothing', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            waitlistRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteChild(1, Role.PARENT, 5, ACTOR)).rejects.toMatchObject({
                response: { error: 'CHILD_ON_WAITLIST' },
            });
            expect(manager.delete).not.toHaveBeenCalled();
        });

        /** The office keeps its tool for a child added, and placed, in error. */
        it('does not ask the office about enrolments', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            enrollmentRepo.exists!.mockResolvedValue(true);
            waitlistRepo.exists!.mockResolvedValue(true);

            await service.deleteChild(1, Role.ADMIN, 999, ACTOR);

            expect(manager.delete).toHaveBeenCalledWith(Child, 1);
        });

        /** The consent row goes with the child, so the office hears it went — before the cascade takes it. */
        it('announces a consent in force to the office, in the transaction and before the delete', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            const order: string[] = [];
            consents.announceErasure.mockImplementation(() => {
                order.push('announce');
                return Promise.resolve(1);
            });
            manager.delete.mockImplementation(() => {
                order.push('delete');
                return Promise.resolve({ affected: 1 });
            });

            await service.deleteChild(1, Role.PARENT, 5, ACTOR);

            expect(order).toEqual(['announce', 'delete']);
            expect(consents.announceErasure).toHaveBeenCalledWith([1], manager, 'odată cu ștergerea copilului din evidență');
        });
    });

    describe('the group endpoints', () => {
        // Since E11/S1 these are a front door onto `EnrollmentService`: the one-group rule, the
        // capacity rule and the account gate all live there, in the one place that writes
        // `Child.group`. What is worth asserting here is that nothing writes the column behind its
        // back — which is the whole reason the delegation exists.
        it('assigns by opening an enrolment, not by writing the column', async () => {
            await service.assignChildToGroup(1, 2, ADMIN);

            // `acknowledgeWarnings` defaults to false: the S6 age check refuses once and asks, and
            // this route answers only when the screen passes the confirmation through.
            expect(enrollments.enrol).toHaveBeenCalledWith({ childId: 1, groupId: 2, acknowledgeWarnings: false }, ADMIN);
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('passes the S6 confirmation through when the screen sends one', async () => {
            await service.assignChildToGroup(1, 2, ADMIN, true);

            expect(enrollments.enrol).toHaveBeenCalledWith({ childId: 1, groupId: 2, acknowledgeWarnings: true }, ADMIN);
        });

        it('removes by closing the enrolment in force, so the seat is actually freed', async () => {
            enrollments.inForceFor.mockResolvedValue({ id: 9, group: { id: 2 } });

            await service.removeChildFromGroup(1, 2);

            expect(enrollments.close).toHaveBeenCalledWith(9, { status: 'WITHDRAWN' });
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('404s when the child is not in the group it is being removed from', async () => {
            enrollments.inForceFor.mockResolvedValue({ id: 9, group: { id: 7 } });

            await expect(service.removeChildFromGroup(1, 2)).rejects.toThrow(NotFoundException);
            expect(enrollments.close).not.toHaveBeenCalled();
        });

        it('404s when the child is in no group at all', async () => {
            enrollments.inForceFor.mockResolvedValue(null);

            await expect(service.removeChildFromGroup(1, 2)).rejects.toThrow(NotFoundException);
        });
    });
});
