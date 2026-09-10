import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from 'src/entities/user.entity';
import {
    createMockEntityManager,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { Not } from 'typeorm';

describe('UserService', () => {
    let service: UserService;
    let userRepo: MockRepository;
    /** The transaction the write and its trail share — E07/S3. */
    let manager: MockEntityManager;
    let audit: { recordPersonalDataChange: jest.Mock };

    /** Whoever pressed, in the shape `actorFrom` hands over. */
    const ACTOR = { userId: 7, username: 'ana.admin' };

    beforeEach(async () => {
        userRepo = createMockRepository();
        manager = createMockEntityManager();
        audit = { recordPersonalDataChange: jest.fn(() => Promise.resolve()) };
        const module: TestingModule = await Test.createTestingModule({
            providers: [UserService, provideMockRepository(User, userRepo), provideMockDataSource(manager), { provide: AuditService, useValue: audit }],
        }).compile();
        service = module.get(UserService);
    });

    it('getUserById rejects a user that does not exist', async () => {
        userRepo.findOne!.mockResolvedValue(null);
        await expect(service.getUserById(99)).rejects.toThrow(NotFoundException);
    });

    describe('updateUser', () => {
        /** The row being edited, as the first read returns it. */
        const existing = { id: 1, username: 'ana', role: 'PARENT' };

        it('rejects a username another account already holds, without writing anything', async () => {
            userRepo.findOne!.mockResolvedValueOnce(existing).mockResolvedValueOnce({ id: 2, username: 'luca' });

            await expect(service.updateUser(1, { username: 'luca' }, ACTOR)).rejects.toThrow(ConflictException);
            expect(manager.update).not.toHaveBeenCalled();
        });

        /**
         * The row being edited was its own collision. Every save that only meant to change the role
         * re-sent the username the form had prefilled, and got a 409 about the account's own name.
         * Asserted on the query rather than on the outcome: a double that returns `null` would let
         * the bug pass either way, and the `Not(id)` is the whole fix.
         */
        it('excludes the account being edited from that check', async () => {
            userRepo.findOne!.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
            manager.findOne = jest.fn(() => Promise.resolve(existing)) as never;

            await service.updateUser(1, { username: 'ana' }, ACTOR);

            expect(userRepo.findOne).toHaveBeenNthCalledWith(2, { where: { username: 'ana', id: Not(1) } });
        });

        it('writes when the username is free', async () => {
            userRepo.findOne!.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
            manager.findOne = jest.fn(() => Promise.resolve({ id: 1, username: 'ana-noua' })) as never;

            await expect(service.updateUser(1, { username: 'ana-noua' }, ACTOR)).resolves.toMatchObject({ username: 'ana-noua' });
            expect(manager.update).toHaveBeenCalledWith(User, 1, { username: 'ana-noua' });
        });

        it('rejects an account that does not exist, before it looks at anything else', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateUser(1, { role: 'ADMIN' } as never, ACTOR)).rejects.toThrow(NotFoundException);
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('rejects when the account disappears between the write and the re-read', async () => {
            userRepo.findOne!.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
            manager.findOne = jest.fn(() => Promise.resolve(null)) as never;

            await expect(service.updateUser(1, { role: 'ADMIN' } as never, ACTOR)).rejects.toThrow(NotFoundException);
        });

        /**
         * The write that grants ADMIN is the most consequential in the platform and left nothing
         * behind: `approvalDecidedAt` says when a family was let in but not by whom, and a promotion
         * recorded neither. It goes through `recordPersonalDataChange`, so the trail names the field
         * and not the value — `role` is personal data with `account` retention in the inventory.
         */
        it('records the promotion, with the transaction and without the value', async () => {
            userRepo.findOne!.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
            manager.findOne = jest.fn(() => Promise.resolve({ ...existing, role: 'ADMIN' })) as never;

            await service.updateUser(1, { role: 'ADMIN' } as never, ACTOR);

            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, action: AuditAction.UPDATED, entityType: 'User', entityId: 1, fields: ['role'] }),
                manager,
            );
            expect(JSON.stringify(audit.recordPersonalDataChange.mock.calls[0][0])).not.toContain('ADMIN');
        });

        /** A field re-sent unchanged is not a change; the trail would otherwise fill with non-events. */
        it('names only the fields that actually moved', async () => {
            userRepo.findOne!.mockResolvedValueOnce(existing).mockResolvedValueOnce(null);
            manager.findOne = jest.fn(() => Promise.resolve(existing)) as never;

            await service.updateUser(1, { username: 'ana', role: 'PARENT' } as never, ACTOR);

            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(expect.objectContaining({ fields: [] }), manager);
        });
    });

    describe('deleteUser', () => {
        it('records who removed the account, in the transaction that removed it', async () => {
            await service.deleteUser(4, ACTOR);

            expect(manager.delete).toHaveBeenCalledWith(User, 4);
            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, action: AuditAction.DELETED, entityType: 'User', entityId: 4 }),
                manager,
            );
        });

        it('rejects an account that was not there, and records nothing', async () => {
            manager.delete = jest.fn(() => Promise.resolve({ affected: 0 })) as never;

            await expect(service.deleteUser(99, ACTOR)).rejects.toThrow(NotFoundException);
            expect(audit.recordPersonalDataChange).not.toHaveBeenCalled();
        });
    });

    it('getUsersWithoutProfile asks the database rather than filtering in memory', async () => {
        const qb = { where: jest.fn().mockReturnThis(), getMany: jest.fn().mockResolvedValue([]) };
        userRepo.createQueryBuilder!.mockReturnValue(qb);

        await service.getUsersWithoutProfile();

        expect(qb.getMany).toHaveBeenCalled();
    });

    it('getUsersWithoutProfile uses NOT EXISTS, never NOT IN', async () => {
        // `profile.user_id` is nullable, and `x NOT IN (1, 2, NULL)` is NULL rather than true in
        // SQL - so with a single account-less profile in the table the endpoint returned an empty
        // list, always and silently. It backs the admin flow for linking an account to a profile,
        // so it came up empty exactly when it mattered.
        const qb = {
            where: jest.fn().mockReturnThis(),
            subQuery: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('(SELECT 1 FROM profiles profile WHERE profile.user_id = user.id)'),
            getMany: jest.fn().mockResolvedValue([]),
        };
        userRepo.createQueryBuilder!.mockReturnValue(qb);

        await service.getUsersWithoutProfile();

        const clause = (qb.where.mock.calls[0][0] as (b: typeof qb) => string)(qb);
        expect(clause).toContain('NOT EXISTS');
        expect(clause).not.toContain('NOT IN');
    });
});
