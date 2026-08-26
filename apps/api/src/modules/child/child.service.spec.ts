import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChildService } from './child.service';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Group } from 'src/entities/group.entity';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('ChildService', () => {
    let service: ChildService;
    let childRepo: MockRepository;
    let profileRepo: MockRepository;
    let groupRepo: MockRepository;

    /** A child of the parent whose account is `ownerUserId`. */
    const childOwnedBy = (ownerUserId: number) => ({
        id: 1,
        parent: { id: 10, user: { id: ownerUserId } },
    });

    beforeEach(async () => {
        childRepo = createMockRepository();
        profileRepo = createMockRepository();
        groupRepo = createMockRepository();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ChildService,
                provideMockRepository(Child, childRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockRepository(Group, groupRepo),
            ],
        }).compile();

        service = module.get(ChildService);
    });

    describe('createChild', () => {
        it('lets an admin create a child for any parent', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 10 });
            childRepo.create!.mockReturnValue({});
            childRepo.save!.mockResolvedValue({ id: 1 });

            await expect(service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.ADMIN, 999)).resolves.toEqual({
                id: 1,
            });
        });

        it('lets a parent create a child on their own profile', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 10 });
            childRepo.create!.mockReturnValue({});
            childRepo.save!.mockResolvedValue({ id: 1 });

            await expect(service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5)).resolves.toEqual({
                id: 1,
            });
        });

        it("forbids a parent from creating a child on someone else's profile", async () => {
            // The authenticated user's profile is 10, but the request targets 11.
            profileRepo.findOne!.mockResolvedValue({ id: 10 });

            await expect(service.createChild({ parentId: 11, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5)).rejects.toThrow(
                ForbiddenException,
            );
            expect(childRepo.save).not.toHaveBeenCalled();
        });

        it('forbids a user without a profile from creating children', async () => {
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(service.createChild({ parentId: 10, firstName: 'Ion', lastName: 'Pop', birthDate: '2015-01-01' }, Role.PARENT, 5)).rejects.toThrow(
                ForbiddenException,
            );
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
            childRepo.save!.mockImplementation((c: unknown) => Promise.resolve(c));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.PARENT, 5)).resolves.toMatchObject({
                firstName: 'Ana',
            });
        });

        it("forbids updating another parent's child", async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.PARENT, 5)).rejects.toThrow(ForbiddenException);
            expect(childRepo.save).not.toHaveBeenCalled();
        });

        it('lets an admin update any child', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));
            childRepo.save!.mockImplementation((c: unknown) => Promise.resolve(c));

            await expect(service.updateChild(1, { firstName: 'Ana' }, Role.ADMIN, 5)).resolves.toBeDefined();
        });

        it('rejects a child that does not exist', async () => {
            childRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateChild(99, {}, Role.ADMIN, 5)).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteChild', () => {
        it("forbids deleting another parent's child", async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(999));

            await expect(service.deleteChild(1, Role.PARENT, 5)).rejects.toThrow(ForbiddenException);
            expect(childRepo.delete).not.toHaveBeenCalled();
        });

        it('lets a parent delete their own child', async () => {
            childRepo.findOne!.mockResolvedValue(childOwnedBy(5));

            await expect(service.deleteChild(1, Role.PARENT, 5)).resolves.toMatchObject({ message: expect.any(String) });
            expect(childRepo.delete).toHaveBeenCalledWith(1);
        });
    });
});
