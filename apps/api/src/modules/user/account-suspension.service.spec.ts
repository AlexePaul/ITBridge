import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { AccountSuspensionService } from './account-suspension.service';
import { AccountApprovalService } from './account-approval.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { User } from 'src/entities/user.entity';
import { Profile } from 'src/entities/profile.entity';
import { Session } from 'src/entities/session.entity';
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

// As in the approval spec: the claimant reads are SQL, covered by `account-claim.e2e-spec.ts`.
jest.mock('src/modules/auth/claimant', () => ({
    claimedFamilyOf: jest.fn(),
    claimedFamiliesOf: jest.fn(),
}));
const mockedClaimedFamilyOf = claimedFamilyOf as jest.MockedFunction<typeof claimedFamilyOf>;
const mockedClaimedFamiliesOf = claimedFamiliesOf as jest.MockedFunction<typeof claimedFamiliesOf>;

describe('AccountSuspensionService', () => {
    let service: AccountSuspensionService;
    let userRepo: MockRepository;
    let profileRepo: MockRepository;
    let outbox: Record<string, jest.Mock>;
    let manager: MockEntityManager;
    let audit: { recordPersonalDataChange: jest.Mock };

    const ACTOR = { userId: 3, username: 'ana.admin' };
    const NOW = new Date('2026-09-27T09:00:00Z');
    const REASON = 'Contul a fost folosit de persoane din afara familiei.';

    const parent = { id: 7, username: 'ana', role: Role.PARENT, approvalStatus: ApprovalStatus.APPROVED, emailConfirmedAt: NOW, suspendedAt: null };

    /** What the family was sent, as the outbox received it. */
    const queued = () => outbox.queueOrRecord.mock.calls[0] as [{ email: string | null }, { subject: string; bodyText: string }, unknown];

    beforeEach(async () => {
        userRepo = createMockRepository();
        profileRepo = createMockRepository();
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }), queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };
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
                AccountSuspensionService,
                AccountApprovalService,
                provideMockRepository(User, userRepo),
                provideMockRepository(Profile, profileRepo),
                { provide: OutboxService, useValue: outbox },
                // The shipped wording: the reason has to reach the family's inbox.
                MailTemplateService,
                provideMockRepository(MailTemplate, createMockRepository()),
                provideMockDataSource(manager),
                { provide: AuditService, useValue: audit },
            ],
        }).compile();

        service = module.get(AccountSuspensionService);
    });

    describe('suspend', () => {
        it('stamps the day and the reason, and closes every live session in the same transaction', async () => {
            userRepo.findOne!.mockResolvedValue(parent);

            await expect(service.suspend(7, REASON, ACTOR, NOW)).resolves.toEqual({ message: 'Cont suspendat' });

            expect(manager.update).toHaveBeenCalledWith(User, { id: 7 }, { suspendedAt: NOW, suspensionReason: REASON });
            expect(manager.update).toHaveBeenCalledWith(Session, { user: { id: 7 }, revokedAt: IsNull() }, { revokedAt: NOW });
        });

        it('reads the account under a write lock, so two admins pressing together are judged one after the other', async () => {
            userRepo.findOne!.mockResolvedValue(parent);

            await service.suspend(7, REASON, ACTOR, NOW);

            expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: 7 }, lock: { mode: 'pessimistic_write' } });
        });

        it('mails the family the reason — §14 promises an email that says why — through the address gate', async () => {
            userRepo.findOne!.mockResolvedValue(parent);

            await service.suspend(7, REASON, ACTOR, NOW);

            const [recipient, message, via] = queued();
            expect(recipient).toEqual({ email: 'ana@example.com' });
            expect(message.subject).toContain('suspendat');
            expect(message.bodyText).toContain(REASON);
            // What does not change: the contract, per the same paragraph.
            expect(message.bodyText).toContain('Înscrierea copilului nu se schimbă');
            expect(via).toBe(manager);
        });

        it('records who suspended, by field name only', async () => {
            userRepo.findOne!.mockResolvedValue(parent);

            await service.suspend(7, REASON, ACTOR, NOW);

            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: ACTOR,
                    action: AuditAction.UPDATED,
                    entityType: 'User',
                    entityId: 7,
                    fields: ['suspendedAt', 'suspensionReason'],
                }),
                manager,
            );
            expect(JSON.stringify(audit.recordPersonalDataChange.mock.calls[0])).not.toContain(REASON);
        });

        it('is idempotent: an account already suspended is told, not suspended twice or mailed twice', async () => {
            userRepo.findOne!.mockResolvedValue({ ...parent, suspendedAt: new Date('2026-09-20T09:00:00Z') });

            await expect(service.suspend(7, REASON, ACTOR, NOW)).resolves.toEqual({ message: 'Contul era deja suspendat' });

            expect(manager.update).not.toHaveBeenCalled();
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
            expect(audit.recordPersonalDataChange).not.toHaveBeenCalled();
        });

        it('records the message as undeliverable for a family with no address, rather than skipping it', async () => {
            userRepo.findOne!.mockResolvedValue(parent);
            profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: null });

            await service.suspend(7, REASON, ACTOR, NOW);

            expect(queued()[0]).toEqual({ email: null });
        });

        it('writes to the address a claim link proved, for an account not attached yet', async () => {
            userRepo.findOne!.mockResolvedValue({ ...parent, approvalStatus: ApprovalStatus.PENDING });
            profileRepo.findOne!.mockResolvedValue(null);
            mockedClaimedFamilyOf.mockResolvedValue({ claimId: 1, profile: { id: 40, firstName: 'Ana' } as Profile, email: 'ana.claim@example.com' });

            await service.suspend(7, REASON, ACTOR, NOW);

            expect(queued()[0]).toEqual({ email: 'ana.claim@example.com' });
        });

        it("refuses an admin account: an admin's access is its role", async () => {
            userRepo.findOne!.mockResolvedValue({ ...parent, role: Role.ADMIN });

            const refusal = await service.suspend(7, REASON, ACTOR, NOW).catch((e: unknown) => e);

            expect(refusal).toBeInstanceOf(BadRequestException);
            expect((refusal as BadRequestException).getResponse()).toMatchObject({ error: 'NOT_A_PARENT_ACCOUNT' });
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('404s on an account that does not exist', async () => {
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.suspend(99, REASON, ACTOR, NOW)).rejects.toThrow(NotFoundException);
        });
    });

    describe('reactivate', () => {
        const suspended = { ...parent, suspendedAt: new Date('2026-09-20T09:00:00Z'), suspensionReason: REASON };

        it('clears the day and the reason, and tells the family it can sign in again', async () => {
            userRepo.findOne!.mockResolvedValue(suspended);

            await expect(service.reactivate(7, ACTOR)).resolves.toEqual({ message: 'Suspendarea a fost ridicată' });

            expect(manager.update).toHaveBeenCalledWith(User, { id: 7 }, { suspendedAt: null, suspensionReason: null });
            const [recipient, message] = queued();
            expect(recipient).toEqual({ email: 'ana@example.com' });
            expect(message.subject).toContain('nu mai e suspendat');
            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, entityId: 7, fields: ['suspendedAt', 'suspensionReason'] }),
                manager,
            );
        });

        it('touches no session: the family signs in again itself', async () => {
            userRepo.findOne!.mockResolvedValue(suspended);

            await service.reactivate(7, ACTOR);

            expect(manager.update).not.toHaveBeenCalledWith(Session, expect.anything(), expect.anything());
        });

        it('is idempotent: an account that is not suspended is told so, and nobody is mailed', async () => {
            userRepo.findOne!.mockResolvedValue(parent);

            await expect(service.reactivate(7, ACTOR)).resolves.toEqual({ message: 'Contul nu era suspendat' });

            expect(manager.update).not.toHaveBeenCalled();
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });
    });

    describe('listSuspended', () => {
        it('asks for suspended parent accounts only, most recent first', async () => {
            userRepo.find!.mockResolvedValue([]);

            await expect(service.listSuspended()).resolves.toEqual([]);

            expect(userRepo.find).toHaveBeenCalledWith({
                where: { role: Role.PARENT, suspendedAt: Not(IsNull()) },
                order: { suspendedAt: 'DESC', id: 'DESC' },
            });
        });

        it('names the family and carries the day and the reason it was sent', async () => {
            const suspendedAt = new Date('2026-09-20T09:00:00Z');
            userRepo.find!.mockResolvedValue([{ ...parent, createdAt: NOW, suspendedAt, suspensionReason: REASON }]);
            profileRepo.createQueryBuilder!.mockReturnValue(
                createMockQueryBuilder({ many: [{ firstName: 'Ana', lastName: 'Popescu', email: 'ana@example.com', phone: '+40712345678', user: { id: 7 } }] }),
            );

            const [row] = await service.listSuspended();

            expect(row).toMatchObject({ userId: 7, firstName: 'Ana', lastName: 'Popescu', suspendedAt, suspensionReason: REASON });
        });
    });
});
