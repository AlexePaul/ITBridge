import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { AuditService } from 'src/modules/audit/audit.service';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('ProfileService', () => {
    /** E07/S3. Field names reach the trail; values never do. */
    let audit: { recordPersonalDataChange: jest.Mock };

    /** Whoever pressed the button, in the shape `actorFrom` hands over. */
    const ACTOR = { userId: 5, username: 'ana' };
    let service: ProfileService;
    let profileRepo: MockRepository;

    beforeEach(async () => {
        profileRepo = createMockRepository();

        audit = { recordPersonalDataChange: jest.fn(() => Promise.resolve()) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [ProfileService, provideMockRepository(Profile, profileRepo), { provide: AuditService, useValue: audit }],
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

            await expect(service.updateProfile({ firstName: 'X' }, 1, Role.PARENT, 5, ACTOR)).rejects.toThrow(UnauthorizedException);
            expect(profileRepo.save).not.toHaveBeenCalled();
        });

        it('forbids a PARENT from updating a profile with no account attached', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: null });

            await expect(service.updateProfile({ firstName: 'X' }, 1, Role.PARENT, 5, ACTOR)).rejects.toThrow(UnauthorizedException);
        });

        it('lets a user update their own profile', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 5 } });
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await expect(service.updateProfile({ firstName: 'Ana' }, 1, Role.PARENT, 5, ACTOR)).resolves.toMatchObject({
                firstName: 'Ana',
            });
        });

        it('does not return the attached account in the response', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 5 } });
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const result = await service.updateProfile({ firstName: 'Ana' }, 1, Role.PARENT, 5, ACTOR);

            expect(result.user).toBeUndefined();
        });

        it('rejects a profile that does not exist', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateProfile({}, 99, Role.ADMIN, 5, ACTOR)).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteProfile', () => {
        it("forbids deleting another user's profile", async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await expect(service.deleteProfile(1, Role.PARENT, 5, ACTOR)).rejects.toThrow(UnauthorizedException);
            expect(profileRepo.delete).not.toHaveBeenCalled();
        });

        it('lets an admin delete any profile', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await service.deleteProfile(1, Role.ADMIN, 5, ACTOR);

            expect(profileRepo.delete).toHaveBeenCalledWith(1);
        });
    });
    /**
     * E07/S3, the personal-data half. What reaches the trail is *which* fields moved, never what
     * they became: `Profile`'s fields are held under the `account` retention rule and go when the
     * family goes, while the log is held under `audit` and outlives what it describes. Values
     * crossing that line would sit here after the family was erased, with nothing left to walk to
     * find them.
     */
    describe('audit trail', () => {
        /**
         * Rebuilt per test, not shared. `applyDefined` mutates the row the repository handed back,
         * so one object across the describe would carry the first test's edit into the second — and
         * the second is precisely the one asserting that nothing changed.
         */
        let stored: Record<string, unknown>;

        beforeEach(() => {
            stored = { id: 1, firstName: 'Ana', lastName: 'Pop', phone: '+40712345678', user: { id: 5 } };
            // The service looks the row up by id and then, for a changed phone, asks whether anybody
            // else already has that number. One blanket answer makes the second lookup find *this*
            // profile and refuse the edit as a duplicate of itself.
            profileRepo.findOne!.mockImplementation((options: { where?: Record<string, unknown> }) =>
                Promise.resolve(options?.where && 'id' in options.where ? stored : null),
            );
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));
        });

        it('names the fields that moved, and passes no values at all', async () => {
            await service.updateProfile({ phone: '+40799999999' }, 1, Role.ADMIN, 5, ACTOR);

            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, entityType: 'Profile', entityId: 1, fields: ['phone'] }),
            );
            const [[call]] = audit.recordPersonalDataChange.mock.calls as [{ fields: string[] }][];
            expect(JSON.stringify(call)).not.toContain('+40799999999');
            expect(JSON.stringify(call)).not.toContain('+40712345678');
        });

        it('writes nothing when a form round-trips without changing anything', async () => {
            await service.updateProfile({ firstName: 'Ana', phone: '+40712345678' }, 1, Role.ADMIN, 5, ACTOR);

            // `recordPersonalDataChange` returns early on an empty list, but the service should not
            // have found anything to give it either.
            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(expect.objectContaining({ fields: [] }));
        });

        it('records a deletion as the act, not as a copy of what was deleted', async () => {
            await service.deleteProfile(1, Role.ADMIN, 5, ACTOR);

            const [[call]] = audit.recordPersonalDataChange.mock.calls as [{ fields: string[] }][];
            expect(JSON.stringify(call)).not.toContain('Ana');
            expect(JSON.stringify(call)).not.toContain('+40712345678');
        });
    });
});
