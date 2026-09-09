import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CONFIRMATION_TTL_MS, EmailConfirmationService, hashToken } from './email-confirmation.service';
import { EmailConfirmation } from 'src/entities/email-confirmation.entity';
import { User } from 'src/entities/user.entity';
import { Profile } from 'src/entities/profile.entity';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';

describe('EmailConfirmationService', () => {
    let service: EmailConfirmationService;
    let confirmationRepo: MockRepository;
    let userRepo: MockRepository;
    /** The address on file. A link proves one address, and only while it is still this one. */
    let profileRepo: MockRepository;
    let transaction: jest.Mock;
    let manager: { update: jest.Mock };
    let mailTemplates: { render: jest.Mock };
    let outbox: { queue: jest.Mock };

    const user = { id: 7 } as User;

    beforeEach(async () => {
        confirmationRepo = createMockRepository();
        userRepo = createMockRepository();
        profileRepo = createMockRepository();
        profileRepo.findOne!.mockResolvedValue({ id: 3, email: 'ana@pop.ro' });

        confirmationRepo.create!.mockImplementation((data: unknown) => data);
        confirmationRepo.save!.mockImplementation((data: unknown) => Promise.resolve(data));

        mailTemplates = {
            render: jest
                .fn()
                .mockImplementation((_name: string, vars: { confirmUrl: string; firstName: string }) =>
                    Promise.resolve({ subject: 'Confirmă adresa', bodyText: `Salut ${vars.firstName}: ${vars.confirmUrl}`, bodyHtml: null }),
                ),
        };
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }) };

        manager = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
        transaction = jest.fn((run: (m: unknown) => Promise<unknown>) => run(manager));
        // `confirm` reaches the manager through the repository it already holds, rather than
        // injecting a DataSource for one call.
        (confirmationRepo as Record<string, unknown>).manager = { transaction };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EmailConfirmationService,
                provideMockRepository(EmailConfirmation, confirmationRepo),
                provideMockRepository(User, userRepo),
                provideMockRepository(Profile, profileRepo),
                { provide: MailTemplateService, useValue: mailTemplates },
                { provide: OutboxService, useValue: outbox },
            ],
        }).compile();

        service = module.get(EmailConfirmationService);
    });

    /**
     * The composition three callers share — registration, the resend button, and the profile edit
     * that moves the address. It lived twice inside `AuthService` and was about to live a third
     * time; copied again, the newest caller would have been free to render a different template or
     * queue to a different address, and the only way to find out would have been a family who
     * never got a link.
     */
    describe('issueAndSend', () => {
        it('puts the issued token in the link, and the link in the message', async () => {
            await service.issueAndSend(user, { firstName: 'Ana', email: 'ana@example.com' });

            const token = (confirmationRepo.save!.mock.calls[0][0] as { tokenHash: string }).tokenHash;
            const rendered = mailTemplates.render.mock.calls[0][1] as { confirmUrl: string; firstName: string };
            expect(rendered.firstName).toBe('Ana');
            // The row keeps the hash, the link carries the token — so the link must not contain it.
            expect(rendered.confirmUrl).not.toContain(token);
            expect(hashToken(rendered.confirmUrl.split('=').pop() as string)).toBe(token);

            const queued = outbox.queue.mock.calls[0][0] as { to: string; bodyText: string };
            expect(queued.to).toBe('ana@example.com');
            expect(queued.bodyText).toContain(rendered.confirmUrl);
        });

        it("writes the row and the message through the caller's transaction, or neither", async () => {
            const callersManager = { note: 'the caller' } as unknown as Parameters<typeof service.issueAndSend>[3];
            (confirmationRepo as Record<string, unknown>).manager = { transaction };
            const repositoryOf = jest.fn().mockReturnValue(confirmationRepo);
            (callersManager as unknown as { getRepository: jest.Mock }).getRepository = repositoryOf;

            await service.issueAndSend(user, { firstName: 'Ana', email: 'ana@example.com' }, new Date(), callersManager);

            expect(repositoryOf).toHaveBeenCalled();
            expect(outbox.queue.mock.calls[0][1]).toBe(callersManager);
        });
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
        // `email` is on every real row — `issueFor` copies the address the link was sent to onto it
        // — and it is what says whether the link still proves the address on file.
        const live = (overrides: Record<string, unknown> = {}) => ({
            id: 3,
            user: { id: 7 },
            email: 'ana@pop.ro',
            consumedAt: null,
            expiresAt: new Date('2026-09-01T00:00:00Z'),
            ...overrides,
        });

        it('looks the token up by its hash', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live());

            await service.confirm('tok-abc', new Date('2026-08-30T00:00:00Z'));

            expect(confirmationRepo.findOne!.mock.calls[0][0]).toMatchObject({ where: { tokenHash: hashToken('tok-abc') } });
        });

        /**
         * The hole E11/S2 left open. The edit that moves an address clears `emailConfirmedAt` and
         * sends a fresh link — but the old link stayed live for the rest of its forty-eight hours,
         * and clicking it stamped the account confirmed again. `queueOrRecord` reads that stamp
         * before writing to an address and `isAccountActive` reads it before a child can be put in
         * a group, so whoever could read the *old* address — a stranger, when the reason for the
         * edit was a typo — could reopen a gate that claims the family proved the *new* one.
         */
        it('refuses a link issued for an address that has since moved', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live({ email: 'gresit@pop.ro' }));
            profileRepo.findOne!.mockResolvedValue({ id: 3, email: 'corect@pop.ro' });

            await expect(service.confirm('tok-abc', new Date('2026-08-30T00:00:00Z'))).rejects.toMatchObject({
                response: { error: 'CONFIRMATION_TOKEN_SUPERSEDED' },
            });
            expect(transaction).not.toHaveBeenCalled();
        });

        /**
         * Capitalisation reaches the same mailbox, so `movesTheAddress` does not call it a move and
         * no new link is issued. A stricter comparison here would kill the only live link a family
         * has, over an edit that changed nothing.
         */
        it('takes a link whose address differs only in capitalisation', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live({ email: 'Ana@Pop.ro' }));
            profileRepo.findOne!.mockResolvedValue({ id: 3, email: 'ana@pop.ro ' });

            await expect(service.confirm('tok-abc', new Date('2026-08-30T00:00:00Z'))).resolves.toBeDefined();
        });

        /** No profile is no contradiction: there is no address on file for the token to disagree with. */
        it('takes a link for an account with no profile at all', async () => {
            confirmationRepo.findOne!.mockResolvedValue(live());
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(service.confirm('tok-abc', new Date('2026-08-30T00:00:00Z'))).resolves.toBeDefined();
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

        it('tells the four refusals apart, because the interface has to', async () => {
            // Expired can be replaced, used means the job is done, unknown means it was mistyped,
            // and superseded means a newer link is already in the inbox. One shared message would
            // leave a parent with no idea which of the four they are in.
            // The `now` is passed rather than left to the system clock. It used to be left, and the
            // fixture's expiry is a fixed day — so every row read as expired once that day passed,
            // and three of the four cases would have collapsed into one answer without the
            // assertion noticing which.
            const now = new Date('2026-08-30T00:00:00Z');
            const codeOf = async (token: string): Promise<string | undefined> =>
                service
                    .confirm(token, now)
                    .then(() => undefined)
                    .catch((error: BadRequestException) => (error.getResponse() as { error?: string }).error);

            confirmationRepo.findOne!.mockResolvedValue(null);
            const unknown = await codeOf('a');
            confirmationRepo.findOne!.mockResolvedValue(live({ consumedAt: new Date('2026-01-01') }));
            const used = await codeOf('b');
            confirmationRepo.findOne!.mockResolvedValue(live({ expiresAt: new Date('2026-01-01') }));
            const expired = await codeOf('c');
            confirmationRepo.findOne!.mockResolvedValue(live({ email: 'veche@pop.ro' }));
            const superseded = await codeOf('d');

            expect(new Set([unknown, used, expired, superseded]).size).toBe(4);
        });
    });
});
