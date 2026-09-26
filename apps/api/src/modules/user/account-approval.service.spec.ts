import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountApprovalService } from './account-approval.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { User } from 'src/entities/user.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import {
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { claimedFamiliesOf, claimedFamilyOf } from 'src/modules/auth/claimant';

// The claimant reads are SQL over two tables and are exercised against Postgres by
// `account-claim.e2e-spec.ts`; here each test says which family, if any, an account claimed.
jest.mock('src/modules/auth/claimant', () => ({
    claimedFamilyOf: jest.fn(),
    claimedFamiliesOf: jest.fn(),
}));
const mockedClaimedFamilyOf = claimedFamilyOf as jest.MockedFunction<typeof claimedFamilyOf>;
const mockedClaimedFamiliesOf = claimedFamiliesOf as jest.MockedFunction<typeof claimedFamiliesOf>;

describe('AccountApprovalService', () => {
    let service: AccountApprovalService;
    let userRepo: MockRepository;
    let profileRepo: MockRepository;
    let outbox: Record<string, jest.Mock>;
    let manager: MockEntityManager;
    /** E07/S3: who decided. The row records when, and until now nothing recorded who. */
    let audit: { recordPersonalDataChange: jest.Mock };

    /** Whoever pressed, in the shape `actorFrom` hands over. */
    const ACTOR = { userId: 3, username: 'ana.admin' };

    const pendingParent = { id: 7, username: 'ana', role: Role.PARENT, approvalStatus: ApprovalStatus.PENDING, emailConfirmedAt: null };

    beforeEach(async () => {
        userRepo = createMockRepository();
        profileRepo = createMockRepository();
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }), queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };
        // The verdicts read the account again under its lock, through the transaction's manager.
        manager = createMockEntityManager(
            new Map<unknown, MockRepository>([
                [User, userRepo],
                [Profile, profileRepo],
            ]),
        );
        manager.findOne = jest.fn((entity: unknown, options: unknown) => (entity === Profile ? profileRepo.findOne!(options) : Promise.resolve(null)));
        audit = { recordPersonalDataChange: jest.fn(() => Promise.resolve()) };

        profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: 'ana@example.com' });
        mockedClaimedFamilyOf.mockResolvedValue(null);
        mockedClaimedFamiliesOf.mockResolvedValue(new Map());

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AccountApprovalService,
                provideMockRepository(User, userRepo),
                provideMockRepository(Profile, profileRepo),
                { provide: OutboxService, useValue: outbox },
                // Real template service, no overrides in the mock repo — the wording assertions
                // hold against the shipped defaults.
                MailTemplateService,
                provideMockRepository(MailTemplate, createMockRepository()),
                provideMockDataSource(manager),
                { provide: AuditService, useValue: audit },
            ],
        }).compile();

        service = module.get(AccountApprovalService);
    });

    describe('listPending', () => {
        it('asks only for parent accounts that are still pending, oldest first', async () => {
            userRepo.find!.mockResolvedValue([]);

            await service.listPending();

            expect(userRepo.find).toHaveBeenCalledWith({
                where: { role: Role.PARENT, approvalStatus: ApprovalStatus.PENDING },
                order: { createdAt: 'ASC' },
            });
        });

        it('does not go looking for profiles when nobody is waiting', async () => {
            userRepo.find!.mockResolvedValue([]);

            await expect(service.listPending()).resolves.toEqual([]);
            expect(profileRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('shows accounts whose address is not confirmed yet, flagged rather than hidden', async () => {
            const createdAt = new Date('2026-08-01T09:00:00Z');
            userRepo.find!.mockResolvedValue([{ ...pendingParent, createdAt }]);
            profileRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ firstName: 'Ana', lastName: 'Popescu', email: 'ana@example.com', phone: '0712345678', user: { id: 7 } }] }),
            );

            const [row] = await service.listPending();

            // Hiding them would make a registration that never confirmed invisible — which is the
            // case the school most wants to see.
            expect(row).toMatchObject({ userId: 7, emailConfirmed: false, firstName: 'Ana', email: 'ana@example.com' });
        });

        it('survives a pending account that has no profile', async () => {
            userRepo.find!.mockResolvedValue([{ ...pendingParent, createdAt: new Date() }]);
            profileRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [] }));

            const [row] = await service.listPending();

            expect(row).toMatchObject({ userId: 7, firstName: null, email: null, claimedProfileId: null });
        });

        // Review of 26 September 2026: an account created from a claim link has no family attached,
        // and its row names the family it asks for — a row of nulls would ask for a blind approval.
        it('names the family an account created from a claim link asks to be attached to', async () => {
            userRepo.find!.mockResolvedValue([{ ...pendingParent, createdAt: new Date() }]);
            profileRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: [] }));
            mockedClaimedFamiliesOf.mockResolvedValue(
                new Map([[7, { id: 40, firstName: 'Ana', lastName: 'Popescu', email: 'ana@example.com', phone: null } as unknown as Profile]]),
            );

            const [row] = await service.listPending();

            expect(row).toMatchObject({ userId: 7, firstName: 'Ana', lastName: 'Popescu', email: 'ana@example.com', claimedProfileId: 40 });
        });
    });

    describe('approve', () => {
        it('opens the second gate and stamps when the decision was made', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.approve(7, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(
                User,
                { id: 7 },
                expect.objectContaining({ approvalStatus: ApprovalStatus.APPROVED, approvalDecidedAt: expect.any(Date) }),
            );
        });

        it('tells the family, in the same transaction as the decision', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.approve(7, ACTOR);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }), expect.anything(), manager);
        });

        /**
         * `approvalDecidedAt` recorded when the school let a family in; nothing recorded who. This is
         * the decision that turns a stranger into an account that can put a child in a room.
         */
        it('records who approved, in the transaction that approved', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.approve(7, ACTOR);

            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: ACTOR,
                    action: AuditAction.UPDATED,
                    entityType: 'User',
                    entityId: 7,
                    fields: ['approvalStatus', 'approvalDecidedAt'],
                    note: 'cont aprobat',
                }),
                manager,
            );
        });

        it('records nothing when the second click has nothing left to decide', async () => {
            userRepo.findOne!.mockResolvedValue({ ...pendingParent, approvalStatus: ApprovalStatus.APPROVED });

            await service.approve(7, ACTOR);

            expect(audit.recordPersonalDataChange).not.toHaveBeenCalled();
        });

        it('is idempotent: a second admin clicking approve is told, not refused', async () => {
            userRepo.findOne!.mockResolvedValue({ ...pendingParent, approvalStatus: ApprovalStatus.APPROVED });

            await expect(service.approve(7, ACTOR)).resolves.toMatchObject({ message: 'Contul era deja aprobat' });
            expect(manager.update).not.toHaveBeenCalled();
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('approves a family with no address, and records that the message went nowhere', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);
            profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: null });

            await service.approve(7, ACTOR);

            expect(manager.update).toHaveBeenCalled();
            // E17/S5 changed this from "sends nothing" to "records that it could not": the outbox
            // is handed the recipient either way, and writes an `undeliverable` row when there is
            // no address. Skipping quietly put the fact in a log nobody reads.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything(), manager);
        });

        describe('an account created from a claim link', () => {
            const claimed = { claimId: 5, profile: { id: 40, firstName: 'Ana', email: 'ana@example.com' } as Profile, email: 'ana@example.com' };
            const lockedFamily = (overrides: Partial<Profile> = {}) => {
                const builder = createMockQueryBuilder({
                    one: { id: 40, firstName: 'Ana', email: 'ana@example.com', user: null, erasedAt: null, ...overrides },
                });
                profileRepo.createQueryBuilder!.mockReturnValue(builder);
                return builder;
            };

            beforeEach(() => {
                userRepo.findOne!.mockResolvedValue(pendingParent);
                mockedClaimedFamilyOf.mockResolvedValue(claimed);
            });

            // Review of 26 September 2026: attached at the claim, the account read the family's data
            // before anybody at the school had looked; approving is what hands it over now.
            it('attaches it to its family, holding the family row locked, and says so in the trail', async () => {
                const builder = lockedFamily();

                await service.approve(7, ACTOR);

                expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write', undefined, ['profile']);
                expect(manager.update).toHaveBeenCalledWith(Profile, { id: 40 }, { user: { id: 7 } });
                expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                    expect.objectContaining({ actor: ACTOR, entityType: 'Profile', entityId: 40, fields: ['user'] }),
                    manager,
                );
                expect(outbox.queueOrRecord).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }), expect.anything(), manager);
            });

            it.each([
                ['an address corrected since the link went out', { email: 'alta@example.com' }],
                ['an account attached to the family since', { user: { id: 9 } as never }],
                ['an erasure', { erasedAt: new Date() }],
            ])('refuses after %s, and attaches nothing', async (_case, overrides) => {
                lockedFamily(overrides);

                await expect(service.approve(7, ACTOR)).rejects.toMatchObject({ response: { error: 'CLAIMED_FAMILY_CHANGED' } });
                expect(manager.update).not.toHaveBeenCalled();
                expect(outbox.queueOrRecord).not.toHaveBeenCalled();
            });
        });

        it('refuses to approve an admin account', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 1, role: Role.ADMIN, approvalStatus: ApprovalStatus.PENDING });

            await expect(service.approve(1, ACTOR)).rejects.toThrow(BadRequestException);
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('404s on a user that does not exist', async () => {
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.approve(99, ACTOR)).rejects.toThrow(NotFoundException);
        });
    });

    describe('reject', () => {
        it('records the reason on the row', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.reject(7, ACTOR, 'duplicat');

            expect(manager.update).toHaveBeenCalledWith(
                User,
                { id: 7 },
                expect.objectContaining({ approvalStatus: ApprovalStatus.REJECTED, rejectionReason: 'duplicat' }),
            );
        });

        it('never puts the reason in the message to the parent', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.reject(7, ACTOR, 'cont de test');

            // The reason is a note one admin leaves another. Sending it would either leak internal
            // shorthand or make every admin word each note as if a parent would read it.
            const [, message] = outbox.queueOrRecord.mock.calls[0] as [unknown, { bodyText: string; subject: string }];
            expect(message.bodyText).not.toContain('cont de test');
            expect(message.subject).not.toContain('cont de test');
        });

        it('records who refused, in the transaction that refused', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.reject(7, ACTOR, 'duplicat');

            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, entityType: 'User', entityId: 7, note: 'cont respins' }),
                manager,
            );
            // The admin's own sentence stays on the row for whoever may read it; the trail takes
            // field names, not content.
            expect(JSON.stringify(audit.recordPersonalDataChange.mock.calls[0][0])).not.toContain('duplicat');
        });

        it('refuses to reject an account that is already approved', async () => {
            userRepo.findOne!.mockResolvedValue({ ...pendingParent, approvalStatus: ApprovalStatus.APPROVED });

            await expect(service.reject(7, ACTOR)).rejects.toMatchObject({ response: { error: 'ACCOUNT_ALREADY_APPROVED' } });
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('is idempotent on an account already rejected', async () => {
            userRepo.findOne!.mockResolvedValue({ ...pendingParent, approvalStatus: ApprovalStatus.REJECTED });

            await expect(service.reject(7, ACTOR)).resolves.toMatchObject({ message: 'Contul era deja respins' });
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('writes to the address a claim link proved, for an account not attached to any family', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);
            profileRepo.findOne!.mockResolvedValue(null);
            mockedClaimedFamilyOf.mockResolvedValue({ claimId: 5, profile: { id: 40, firstName: 'Ana' } as Profile, email: 'ana@example.com' });

            await service.reject(7, ACTOR);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: 'ana@example.com' }, expect.anything(), manager);
            expect(manager.update).not.toHaveBeenCalledWith(Profile, expect.anything(), expect.anything());
        });
    });
});
