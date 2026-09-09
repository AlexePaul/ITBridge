import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { Profile } from 'src/entities/profile.entity';
import { Child } from 'src/entities/child.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { Role } from 'src/enum/role.enum';
import { AuditService } from 'src/modules/audit/audit.service';
import {
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { EmailConfirmationService } from 'src/modules/auth/email-confirmation.service';
import { User } from 'src/entities/user.entity';

describe('ProfileService', () => {
    /** E07/S3. Field names reach the trail; values never do. */
    let audit: { recordPersonalDataChange: jest.Mock };

    /** Whoever pressed the button, in the shape `actorFrom` hands over. */
    const ACTOR = { userId: 5, username: 'ana' };
    let service: ProfileService;
    let profileRepo: MockRepository;
    let childRepo: MockRepository;
    let invoiceRepo: MockRepository;
    /** E11/S2: an edit that moves the address closes the gate behind it and sends a fresh link. */
    let confirmations: { issueAndSend: jest.Mock };
    let manager: ReturnType<typeof createMockEntityManager>;

    beforeEach(async () => {
        profileRepo = createMockRepository();
        childRepo = createMockRepository();
        invoiceRepo = createMockRepository();
        // Nothing hanging off the family unless a test says so: `deleteProfile` looks before it
        // deletes, and a bare mock returning `undefined` would read as "there are invoices".
        childRepo.exists!.mockResolvedValue(false);
        invoiceRepo.exists!.mockResolvedValue(false);

        audit = { recordPersonalDataChange: jest.fn(() => Promise.resolve()) };
        confirmations = { issueAndSend: jest.fn(() => Promise.resolve()) };
        manager = createMockEntityManager();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProfileService,
                provideMockRepository(Profile, profileRepo),
                provideMockRepository(Child, childRepo),
                provideMockRepository(Invoice, invoiceRepo),
                { provide: AuditService, useValue: audit },
                { provide: EmailConfirmationService, useValue: confirmations },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(ProfileService);
    });

    describe('createProfile', () => {
        it('ignores the userId a PARENT asks for and forces their own', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: unknown) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const dto = { firstName: 'Ana', lastName: 'Pop', userId: 999 };
            await service.createProfile(dto, Role.PARENT, 5, ACTOR);

            expect(dto.userId).toBe(5);
        });

        it('lets an admin attach the profile to any account', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: unknown) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            const dto = { firstName: 'Ana', lastName: 'Pop', userId: 999 };
            await service.createProfile(dto, Role.ADMIN, 5, ACTOR);

            expect(dto.userId).toBe(999);
        });

        it('lets an admin create a profile with no account attached', async () => {
            // The flow from CLAUDE.md: an admin creates a Profile without a User, linking comes later.
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: { user: unknown }) => d);
            profileRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await service.createProfile({ firstName: 'Ana', lastName: 'Pop' }, Role.ADMIN, undefined, ACTOR);

            expect(profileRepo.create!.mock.calls[0][0]).toMatchObject({ user: null });
        });

        it('rejects a second profile for the same account', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1 });

            await expect(service.createProfile({ firstName: 'A', lastName: 'B', userId: 5 }, Role.ADMIN, undefined, ACTOR)).rejects.toThrow(ConflictException);
        });

        it('records the act and the id, never what was typed into it', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            profileRepo.create!.mockImplementation((d: unknown) => d);
            manager.save.mockImplementation((_entity: unknown, p: object) => Promise.resolve({ ...p, id: 77 }));

            await service.createProfile({ firstName: 'Ana', lastName: 'Pop', email: 'ana@pop.ro' }, Role.ADMIN, undefined, ACTOR);

            // With the transaction's manager: the row and the account of it are one unit of work.
            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, entityType: 'Profile', entityId: 77, fields: ['profile'] }),
                manager,
            );
            expect(JSON.stringify(audit.recordPersonalDataChange.mock.calls[0][0])).not.toContain('ana@pop.ro');
        });

        it('rejects an email that is already taken', async () => {
            profileRepo
                .findOne!.mockResolvedValueOnce(null) // no profile on the account
                .mockResolvedValueOnce({ id: 2 }); // email taken

            await expect(service.createProfile({ firstName: 'A', lastName: 'B', email: 'a@b.c', userId: 5 }, Role.ADMIN, undefined, ACTOR)).rejects.toThrow(
                ConflictException,
            );
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

    /**
     * E11/S2's first gate, closing behind a moved address.
     *
     * `AuthService.resendConfirmation` refuses to take an address, so that nobody holding a session
     * can point a confirmation at a mailbox of their choosing — and it says, in as many words, that
     * reopening the gate belongs to the edit that moved the address. This is that edit; it did not
     * do it, so `emailConfirmedAt` went on standing for an address the family had stopped using.
     */
    describe('an address that moves', () => {
        const withAccount = (email: string) => ({
            id: 1,
            firstName: 'Ana',
            lastName: 'Pop',
            email,
            user: { id: 42 },
        });

        beforeEach(() => {
            // Not a duplicate of itself: the uniqueness check looks for another row with the new
            // address, and this suite is about what happens once it finds none.
            profileRepo.findOne!.mockImplementation((options: { where: Record<string, unknown> }) =>
                Promise.resolve('id' in options.where ? withAccount('ana@example.com') : null),
            );
        });

        it('stops counting as confirmed, and sends a link to the new address', async () => {
            await service.updateProfile({ email: 'ana.pop@example.com' }, 1, Role.PARENT, 42, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(User, 42, { emailConfirmedAt: null });
            expect(confirmations.issueAndSend).toHaveBeenCalledWith({ id: 42 }, { firstName: 'Ana', email: 'ana.pop@example.com' }, expect.any(Date), manager);
        });

        it('does both through the same transaction as the edit, or neither', async () => {
            await service.updateProfile({ email: 'ana.pop@example.com' }, 1, Role.ADMIN, 9, ACTOR);

            expect(manager.save).toHaveBeenCalled();
            expect(confirmations.issueAndSend.mock.calls[0][3]).toBe(manager);
        });

        it('leaves an edit that does not touch the address alone', async () => {
            await service.updateProfile({ address: 'Str. Nouă 4' }, 1, Role.PARENT, 42, ACTOR);

            expect(manager.update).not.toHaveBeenCalled();
            expect(confirmations.issueAndSend).not.toHaveBeenCalled();
        });

        it('leaves an address re-sent unchanged alone', async () => {
            await service.updateProfile({ email: 'ana@example.com' }, 1, Role.PARENT, 42, ACTOR);

            expect(manager.update).not.toHaveBeenCalled();
            expect(confirmations.issueAndSend).not.toHaveBeenCalled();
        });

        /** The family an admin typed in from a phone call. There is no account to de-confirm. */
        it('has nothing to close for a profile with no account', async () => {
            profileRepo.findOne!.mockImplementation((options: { where: Record<string, unknown> }) =>
                Promise.resolve('id' in options.where ? { id: 1, firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', user: null } : null),
            );

            await service.updateProfile({ email: 'ana.pop@example.com' }, 1, Role.ADMIN, 9, ACTOR);

            expect(manager.update).not.toHaveBeenCalled();
            expect(confirmations.issueAndSend).not.toHaveBeenCalled();
        });

        /**
         * Cleared, the account proves nothing either — and there is nowhere to send a link.
         *
         * Not reachable through `UpdateProfileDto` today, since `@IsEmail()` refuses an empty
         * value. It is here because the gate closing and the link going out are two facts, and a
         * service that writes them as one is a service where the second can swallow the first.
         */
        it('closes the gate but sends nothing when the address is cleared', async () => {
            await service.updateProfile({ email: null } as never, 1, Role.ADMIN, 9, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(User, 42, { emailConfirmedAt: null });
            expect(confirmations.issueAndSend).not.toHaveBeenCalled();
        });
    });

    describe('deleteProfile', () => {
        it("forbids deleting another user's profile", async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await expect(service.deleteProfile(1, Role.PARENT, 5, ACTOR)).rejects.toThrow(UnauthorizedException);
            expect(manager.delete).not.toHaveBeenCalled();
        });

        it('lets an admin delete a profile with nothing hanging off it', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });

            await service.deleteProfile(1, Role.ADMIN, 5, ACTOR);

            expect(manager.delete).toHaveBeenCalledWith(Profile, 1);
        });

        /**
         * `invoices.parent_id` is CASCADE and `payments.invoice_id` is CASCADE after it, so this
         * one statement used to take the school's whole record of what a family paid. Keeping it is
         * E04/S5's decision and the reason E07/S4 leaves an emptied shell row behind instead of
         * deleting one.
         */
        it('refuses when the family has invoices, and deletes nothing', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });
            invoiceRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteProfile(1, Role.ADMIN, 5, ACTOR)).rejects.toMatchObject({
                response: { error: 'PROFILE_HAS_INVOICES' },
            });
            expect(manager.delete).not.toHaveBeenCalled();
        });

        it('refuses when the family has children, and deletes nothing', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });
            childRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteProfile(1, Role.ADMIN, 5, ACTOR)).rejects.toMatchObject({
                response: { error: 'PROFILE_HAS_CHILDREN' },
            });
            expect(manager.delete).not.toHaveBeenCalled();
        });

        /** The money is named first: it is the one thing the platform promised to keep. */
        it('names the invoices when the family has both', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 999 } });
            invoiceRepo.exists!.mockResolvedValue(true);
            childRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteProfile(1, Role.ADMIN, 5, ACTOR)).rejects.toMatchObject({
                response: { error: 'PROFILE_HAS_INVOICES' },
            });
        });

        it('refuses a parent deleting their own family out from under the invoices', async () => {
            profileRepo.findOne!.mockResolvedValue({ id: 1, user: { id: 5 } });
            invoiceRepo.exists!.mockResolvedValue(true);

            await expect(service.deleteProfile(1, Role.PARENT, 5, ACTOR)).rejects.toMatchObject({
                response: { error: 'PROFILE_HAS_INVOICES' },
            });
            expect(manager.delete).not.toHaveBeenCalled();
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
                manager,
            );
            const [[call]] = audit.recordPersonalDataChange.mock.calls as [{ fields: string[] }][];
            expect(JSON.stringify(call)).not.toContain('+40799999999');
            expect(JSON.stringify(call)).not.toContain('+40712345678');
        });

        it('writes nothing when a form round-trips without changing anything', async () => {
            await service.updateProfile({ firstName: 'Ana', phone: '+40712345678' }, 1, Role.ADMIN, 5, ACTOR);

            // `recordPersonalDataChange` returns early on an empty list, but the service should not
            // have found anything to give it either.
            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(expect.objectContaining({ fields: [] }), manager);
        });

        it('records a deletion as the act, not as a copy of what was deleted', async () => {
            await service.deleteProfile(1, Role.ADMIN, 5, ACTOR);

            const [[call]] = audit.recordPersonalDataChange.mock.calls as [{ fields: string[] }][];
            expect(JSON.stringify(call)).not.toContain('Ana');
            expect(JSON.stringify(call)).not.toContain('+40712345678');
        });
    });
});
