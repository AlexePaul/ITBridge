import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChildService } from './child.service';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Group } from 'src/entities/group.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { Project } from 'src/entities/project.entity';
import { Role } from 'src/enum/role.enum';
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
        manager = createMockEntityManager();
        // Nothing recorded against the child unless a test says so: `deleteChild` looks before it
        // deletes, and an unstubbed `exists` returns `undefined`, which reads as "there is nothing".
        attendanceRepo.exists!.mockResolvedValue(false);
        projectRepo.exists!.mockResolvedValue(false);
        enrollments = {
            enrol: jest.fn().mockResolvedValue({ id: 9 }),
            close: jest.fn().mockResolvedValue({ id: 9 }),
            inForceFor: jest.fn().mockResolvedValue(null),
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
                { provide: EnrollmentService, useValue: enrollments },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(ChildService);
    });

    describe('createChild', () => {
        it('lets an admin create a child for any parent', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 10 });
            childRepo.create!.mockReturnValue({});
            manager.save.mockResolvedValue({ id: 1 });

            await expect(
                service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.ADMIN, 999, ACTOR),
            ).resolves.toEqual({
                id: 1,
            });
        });

        it('lets a parent create a child on their own profile', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 10 });
            childRepo.create!.mockReturnValue({});
            manager.save.mockResolvedValue({ id: 1 });

            await expect(
                service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5, ACTOR),
            ).resolves.toEqual({
                id: 1,
            });
        });

        it('records the act and the id, never the name that came with it', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 10 });
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
            profileRepo.findOne!.mockResolvedValue({ id: 10 });

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
         * `attendances.childId` is CASCADE, so this used to take the register — from a parent's own
         * token. A mark can be corrected; it cannot be made never to have existed.
         */
        it('refuses when the child has been marked, and deletes nothing', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));
            attendanceRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteChild(1, Role.PARENT, 5, ACTOR)).rejects.toMatchObject({
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

            await expect(service.deleteChild(1, Role.PARENT, 5, ACTOR)).rejects.toThrow(ForbiddenException);
        });
    });

    describe('the group endpoints', () => {
        // Since E11/S1 these are a front door onto `EnrollmentService`: the one-group rule, the
        // capacity rule and the account gate all live there, in the one place that writes
        // `Child.group`. What is worth asserting here is that nothing writes the column behind its
        // back — which is the whole reason the delegation exists.
        it('assigns by opening an enrolment, not by writing the column', async () => {
            await service.assignChildToGroup(1, 2, 42);

            // `acknowledgeWarnings` defaults to false: the S6 age check refuses once and asks, and
            // this route answers only when the screen passes the confirmation through.
            expect(enrollments.enrol).toHaveBeenCalledWith({ childId: 1, groupId: 2, acknowledgeWarnings: false }, 42);
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('passes the S6 confirmation through when the screen sends one', async () => {
            await service.assignChildToGroup(1, 2, 42, true);

            expect(enrollments.enrol).toHaveBeenCalledWith({ childId: 1, groupId: 2, acknowledgeWarnings: true }, 42);
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
