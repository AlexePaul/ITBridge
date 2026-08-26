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
        it('ignoră userId-ul cerut de un PARENT și îl forțează pe al lui', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: unknown) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const dto = { firstName: 'Ana', lastName: 'Pop', userId: 999 };
            await service.createProfile(dto, Role.PARENT, 5);

            expect(dto.userId).toBe(5);
        });

        it('lasă adminul să lege profilul de orice cont', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: unknown) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const dto = { firstName: 'Ana', lastName: 'Pop', userId: 999 };
            await service.createProfile(dto, Role.ADMIN, 5);

            expect(dto.userId).toBe(999);
        });

        it('lasă adminul să creeze un profil fără cont atașat', async () => {
            // Fluxul din CLAUDE.md: admin creează Profile fără User, legarea vine mai târziu.
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: { user: unknown }) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await service.createProfile({ firstName: 'Ana', lastName: 'Pop' }, Role.ADMIN);

            expect(profileRepo.create!.mock.calls[0][0]).toMatchObject({ user: null });
        });

        it('respinge un al doilea profil pentru același cont', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1 });

            await expect(service.createProfile({ firstName: 'A', lastName: 'B', userId: 5 }, Role.ADMIN)).rejects.toThrow(ConflictException);
        });

        it('respinge un email deja folosit', async () => {
            profileRepo
                .findOne!.mockResolvedValueOnce(null) // fără profil pe cont
                .mockResolvedValueOnce({ id: 2 }); // email ocupat

            await expect(service.createProfile({ firstName: 'A', lastName: 'B', email: 'a@b.c', userId: 5 }, Role.ADMIN)).rejects.toThrow(ConflictException);
        });
    });

    describe('findProfiles', () => {
        it('forțează filtrul pe utilizatorul autentificat pentru PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            profileRepo.createQueryBuilder!.mockReturnValue(qb);

            // Un PARENT care cere explicit profilul altcuiva.
            await service.findProfiles({ userId: 999 }, Role.PARENT, 42);

            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 42 }]);
            expect(qb.andWhereCalls).not.toContainEqual(['user.id = :userId', { userId: 999 }]);
        });

        it('lasă adminul să filtreze după orice utilizator', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            profileRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findProfiles({ userId: 999 }, Role.ADMIN, 42);

            expect(qb.andWhereCalls).toContainEqual(['user.id = :userId', { userId: 999 }]);
        });
    });

    describe('updateProfile', () => {
        it('interzice modificarea profilului altui utilizator', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await expect(service.updateProfile({ firstName: 'X' }, 1, Role.PARENT, 5)).rejects.toThrow(UnauthorizedException);
            expect(profileRepo.save).not.toHaveBeenCalled();
        });

        it('interzice modificarea unui profil fără cont atașat, de către un PARENT', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: null });

            await expect(service.updateProfile({ firstName: 'X' }, 1, Role.PARENT, 5)).rejects.toThrow(UnauthorizedException);
        });

        it('lasă utilizatorul să-și modifice propriul profil', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 5 } });
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await expect(service.updateProfile({ firstName: 'Ana' }, 1, Role.PARENT, 5)).resolves.toMatchObject({
                firstName: 'Ana',
            });
        });

        it('nu întoarce contul atașat în răspuns', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 5 } });
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const result = await service.updateProfile({ firstName: 'Ana' }, 1, Role.PARENT, 5);

            expect(result.user).toBeUndefined();
        });

        it('respinge un profil inexistent', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateProfile({}, 99, Role.ADMIN, 5)).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteProfile', () => {
        it('interzice ștergerea profilului altui utilizator', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await expect(service.deleteProfile(1, Role.PARENT, 5)).rejects.toThrow(UnauthorizedException);
            expect(profileRepo.delete).not.toHaveBeenCalled();
        });

        it('lasă adminul să șteargă orice profil', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await service.deleteProfile(1, Role.ADMIN, 5);

            expect(profileRepo.delete).toHaveBeenCalledWith(1);
        });
    });
});
