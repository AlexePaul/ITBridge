import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('ProfileService', () => {
    let service: ProfileService;
    let profileRepo: MockRepository;

    beforeEach(async () => {
        profileRepo = createMockRepository();

        const module: TestingModule = await Test.createTestingModule({
            providers: [ProfileService, provideMockRepository(Profile, profileRepo)],
        }).compile();

        service = module.get(ProfileService);
    });

    describe('createProfile', () => {
        it('ignores the userId a PARENT asks for and forces their own', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: unknown) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const dto = { firstName: 'Ana', lastName: 'Pop', userId: 999 };
            await service.createProfile(dto, Role.PARENT, 5);

            expect(dto.userId).toBe(5);
        });

        it('lets an admin attach the profile to any account', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: unknown) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const dto = { firstName: 'Ana', lastName: 'Pop', userId: 999 };
            await service.createProfile(dto, Role.ADMIN, 5);

            expect(dto.userId).toBe(999);
        });

        it('lets an admin create a profile with no account attached', async () => {
            // The flow from CLAUDE.md: an admin creates a Profile without a User, linking comes later.
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: { user: unknown }) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await service.createProfile({ firstName: 'Ana', lastName: 'Pop' }, Role.ADMIN);

            expect(profileRepo.create!.mock.calls[0][0]).toMatchObject({ user: null });
        });

        it('rejects a second profile for the same account', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1 });

            await expect(service.createProfile({ firstName: 'A', lastName: 'B', userId: 5 }, Role.ADMIN)).rejects.toThrow(ConflictException);
        });

        it('rejects an email that is already taken', async () => {
            profileRepo
                .findOne!.mockResolvedValueOnce(null) // no profile on the account
                .mockResolvedValueOnce({ id: 2 }); // email taken

            await expect(service.createProfile({ firstName: 'A', lastName: 'B', email: 'a@b.c', userId: 5 }, Role.ADMIN)).rejects.toThrow(ConflictException);
        });
    });

    describe('findProfiles', () => {
        it('forces the filter onto the authenticated user for a PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            profileRepo.createQueryBuilder!.mockReturnValue(qb);

            // A PARENT explicitly asking for someone else's profile.
            await service.findProfiles({ userId: 999 }, Role.PARENT, 42);

            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 42 }]);
            expect(qb.andWhereCalls).not.toContainEqual(['user.id = :userId', { userId: 999 }]);
        });

        it('lets an admin filter by any user', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            profileRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findProfiles({ userId: 999 }, Role.ADMIN, 42);

            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 999 }]);
        });
    });

    describe('updateProfile', () => {
        it("forbids updating another user's profile", async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await expect(service.updateProfile({ firstName: 'X' }, 1, Role.PARENT, 5)).rejects.toThrow(UnauthorizedException);
            expect(profileRepo.save).not.toHaveBeenCalled();
        });

        it('forbids a PARENT from updating a profile with no account attached', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: null });

            await expect(service.updateProfile({ firstName: 'X' }, 1, Role.PARENT, 5)).rejects.toThrow(UnauthorizedException);
        });

        it('lets a user update their own profile', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 5 } });
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await expect(service.updateProfile({ firstName: 'Ana' }, 1, Role.PARENT, 5)).resolves.toMatchObject({
                firstName: 'Ana',
            });
        });

        it('does not return the attached account in the response', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 5 } });
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const result = await service.updateProfile({ firstName: 'Ana' }, 1, Role.PARENT, 5);

            expect(result.user).toBeUndefined();
        });

        it('rejects a profile that does not exist', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateProfile({}, 99, Role.ADMIN, 5)).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteProfile', () => {
        it("forbids deleting another user's profile", async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await expect(service.deleteProfile(1, Role.PARENT, 5)).rejects.toThrow(UnauthorizedException);
            expect(profileRepo.delete).not.toHaveBeenCalled();
        });

        it('lets an admin delete any profile', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await service.deleteProfile(1, Role.ADMIN, 5);

            expect(profileRepo.delete).toHaveBeenCalledWith(1);
        });
    });
});
