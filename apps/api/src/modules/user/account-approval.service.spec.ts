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

describe('AccountApprovalService', () => {
    let service: AccountApprovalService;
    let userRepo: MockRepository;
    let profileRepo: MockRepository;
    let outbox: Record<string, jest.Mock>;
    let manager: MockEntityManager;

    const pendingParent = { id: 7, username: 'ana', role: Role.PARENT, approvalStatus: ApprovalStatus.PENDING, emailConfirmedAt: null };

    beforeEach(async () => {
        userRepo = createMockRepository();
        profileRepo = createMockRepository();
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }), queueOrRecord: jest.fn().mockResolvedValue({ id: 1 }) };
        manager = createMockEntityManager();

        profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: 'ana@example.com' });

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

            expect(row).toMatchObject({ userId: 7, firstName: null, email: null });
        });
    });

    describe('approve', () => {
        it('opens the second gate and stamps when the decision was made', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.approve(7);

            expect(manager.update).toHaveBeenCalledWith(
                User,
                { id: 7 },
                expect.objectContaining({ approvalStatus: ApprovalStatus.APPROVED, approvalDecidedAt: expect.any(Date) }),
            );
        });

        it('tells the family, in the same transaction as the decision', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.approve(7);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith(expect.objectContaining({ email: 'ana@example.com' }), expect.anything(), manager);
        });

        it('is idempotent: a second admin clicking approve is told, not refused', async () => {
            userRepo.findOne!.mockResolvedValue({ ...pendingParent, approvalStatus: ApprovalStatus.APPROVED });

            await expect(service.approve(7)).resolves.toMatchObject({ message: 'Contul era deja aprobat' });
            expect(manager.update).not.toHaveBeenCalled();
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('approves a family with no address, and records that the message went nowhere', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);
            profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: null });

            await service.approve(7);

            expect(manager.update).toHaveBeenCalled();
            // E17/S5 changed this from "sends nothing" to "records that it could not": the outbox
            // is handed the recipient either way, and writes an `undeliverable` row when there is
            // no address. Skipping quietly put the fact in a log nobody reads.
            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything(), manager);
        });

        it('refuses to approve an admin account', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 1, role: Role.ADMIN, approvalStatus: ApprovalStatus.PENDING });

            await expect(service.approve(1)).rejects.toThrow(BadRequestException);
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('404s on a user that does not exist', async () => {
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.approve(99)).rejects.toThrow(NotFoundException);
        });
    });

    describe('reject', () => {
        it('records the reason on the row', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.reject(7, 'duplicat');

            expect(manager.update).toHaveBeenCalledWith(
                User,
                { id: 7 },
                expect.objectContaining({ approvalStatus: ApprovalStatus.REJECTED, rejectionReason: 'duplicat' }),
            );
        });

        it('never puts the reason in the message to the parent', async () => {
            userRepo.findOne!.mockResolvedValue(pendingParent);

            await service.reject(7, 'cont de test');

            // The reason is a note one admin leaves another. Sending it would either leak internal
            // shorthand or make every admin word each note as if a parent would read it.
            const [, message] = outbox.queueOrRecord.mock.calls[0] as [unknown, { bodyText: string; subject: string }];
            expect(message.bodyText).not.toContain('cont de test');
            expect(message.subject).not.toContain('cont de test');
        });

        it('refuses to reject an account that is already approved', async () => {
            userRepo.findOne!.mockResolvedValue({ ...pendingParent, approvalStatus: ApprovalStatus.APPROVED });

            await expect(service.reject(7)).rejects.toMatchObject({ response: { error: 'ACCOUNT_ALREADY_APPROVED' } });
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('is idempotent on an account already rejected', async () => {
            userRepo.findOne!.mockResolvedValue({ ...pendingParent, approvalStatus: ApprovalStatus.REJECTED });

            await expect(service.reject(7)).resolves.toMatchObject({ message: 'Contul era deja respins' });
            expect(outbox.queue).not.toHaveBeenCalled();
        });
    });
});
