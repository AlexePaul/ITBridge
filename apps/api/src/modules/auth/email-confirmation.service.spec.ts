import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CONFIRMATION_TTL_MS, EmailConfirmationService, hashToken } from './email-confirmation.service';
import { EmailConfirmation } from 'src/entities/email-confirmation.entity';
import { User } from 'src/entities/user.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('EmailConfirmationService', () => {
    let service: EmailConfirmationService;
    let confirmationRepo: MockRepository;
    let userRepo: MockRepository;
    let transaction: jest.Mock;
    let manager: { update: jest.Mock };

    const user = { id: 7 } as User;

    beforeEach(async () => {
        confirmationRepo = createMockRepository();
        userRepo = createMockRepository();

        confirmationRepo.create!.mockImplementation((data: unknown) => data);
        confirmationRepo.save!.mockImplementation((data: unknown) => Promise.resolve(data));

        manager = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
        transaction = jest.fn((run: (m: unknown) => Promise<unknown>) => run(manager));
        // `confirm` reaches the manager through the repository it already holds, rather than
        // injecting a DataSource for one call.
        (confirmationRepo as Record<string, unknown>).manager = { transaction };

        const module: TestingModule = await Test.createTestingModule({
            providers: [EmailConfirmationService, provideMockRepository(EmailConfirmation, confirmationRepo), provideMockRepository(User, userRepo)],
        }).compile();

        service = module.get(EmailConfirmationService);
    });

    describe('issueFor', () => {
        it('stores the hash of the token and never the token itself', async () => {
            const { token } = await service.issueFor(user, 'ana@example.com');

            // The same rule as `sessions`: a link in an inbox is a bearer credential, and a leaked
            // backup of this table must not hand somebody a set of verifiable addresses.
            const row = confirmationRepo.save!.mock.calls[0][0] as { tokenHash: string };
            expect(row.tokenHash).toBe(hashToken(token));
            expect(JSON.stringify(row)).not.toContain(token);
        });

        it('issues a different token every time', async () => {
            const first = await service.issueFor(user, 'ana@example.com');
            const second = await service.issueFor(user, 'ana@example.com');

            expect(first.token).not.toBe(second.token);
        });

        it('expires 48 hours out', async () => {
            const now = new Date('2026-08-30T12:00:00Z');

            const { expiresAt } = await service.issueFor(user, 'ana@example.com', now);

            expect(expiresAt.getTime() - now.getTime()).toBe(CONFIRMATION_TTL_MS);
        });

        it('copies the address the link is sent to onto the row', async () => {
            await service.issueFor(user, 'ana@example.com');

            // Read back at confirmation time instead of `Profile.email`, so a parent who changes
            // their address cannot confirm the new one by clicking a link sent to the old.
            expect(confirmationRepo.save!.mock.calls[0][0]).toMatchObject({ email: 'ana@example.com' });
        });

        it('writes through the transaction it is handed, not its own repository', async () => {
            const scoped = createMockRepository();
            scoped.create!.mockImplementation((data: unknown) => data);
            scoped.save!.mockImplementation((data: unknown) => Promise.resolve(data));
            const callerManager = { getRepository: jest.fn().mockReturnValue(scoped) };

            await service.issueFor(user, 'ana@example.com', new Date(), callerManager as never);

            // A token row that survived a rolled-back registration points at a user that does not
            // exist; a registration that committed without one leaves a family unable to confirm.
            expect(scoped.save).toHaveBeenCalled();
            expect(confirmationRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('confirm', () => {
        const live = (overrides: Record<string, unknown> = {}) => ({
            id: 3,
            user: { id: 7 },
            consumedAt: null,
            expiresAt: new Date('2026-09-01T00:00:00Z'),
            ...overrides,
        });

        it('looks the token up by its hash', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live());

            await service.confirm('tok-abc', new Date('2026-08-30T00:00:00Z'));

            expect(confirmationRepo.findOne!.mock.calls[0][0]).toMatchObject({ where: { tokenHash: hashToken('tok-abc') } });
        });

        it('consumes the row and stamps the user in one transaction', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live());
            const now = new Date('2026-08-30T00:00:00Z');

            await service.confirm('tok-abc', now);

            // A crash between the two would burn the parent's only link without confirming
            // anything, and the recovery would be an admin editing the database.
            expect(transaction).toHaveBeenCalledTimes(1);
            expect(manager.update).toHaveBeenCalledWith(EmailConfirmation, { id: 3 }, { consumedAt: now });
            expect(manager.update).toHaveBeenCalledWith(User, { id: 7 }, { emailConfirmedAt: now });
        });

        it('refuses an unknown token', async () => {
            confirmationRepo.findOne!.mockResolvedValue(null);

            await expect(service.confirm('nope')).rejects.toMatchObject({ response: { error: 'CONFIRMATION_TOKEN_INVALID' } });
        });

        it('refuses a token that was already used', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live({ consumedAt: new Date('2026-08-29T00:00:00Z') }));

            await expect(service.confirm('tok-abc', new Date('2026-08-30T00:00:00Z'))).rejects.toMatchObject({
                response: { error: 'CONFIRMATION_TOKEN_USED' },
            });
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('refuses a token past its expiry', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live({ expiresAt: new Date('2026-08-29T00:00:00Z') }));

            await expect(service.confirm('tok-abc', new Date('2026-08-30T00:00:00Z'))).rejects.toMatchObject({
                response: { error: 'CONFIRMATION_TOKEN_EXPIRED' },
            });
        });

        it('tells the three refusals apart, because the interface has to', async () => {
            // Expired can be replaced, used means the job is done, unknown means it was mistyped.
            // One shared message would leave a parent with no idea which of the three they are in.
            const codeOf = async (token: string): Promise<string | undefined> =>
                service
                    .confirm(token)
                    .then(() => undefined)
                    .catch((error: BadRequestException) => (error.getResponse() as { error?: string }).error);

            confirmationRepo.findOne!.mockResolvedValue(null);
            const unknown = await codeOf('a');
            confirmationRepo.findOne!.mockResolvedValue(live({ consumedAt: new Date('2026-01-01') }));
            const used = await codeOf('b');
            confirmationRepo.findOne!.mockResolvedValue(live({ expiresAt: new Date('2026-01-01') }));
            const expired = await codeOf('c');

            expect(new Set([unknown, used, expired]).size).toBe(3);
        });
    });
});
