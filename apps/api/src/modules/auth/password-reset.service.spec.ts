import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';

import { PasswordReset } from 'src/entities/password-reset.entity';
import { Profile } from 'src/entities/profile.entity';
import { User } from 'src/entities/user.entity';
import { createMockQueryBuilder, createMockRepository, MockQueryBuilder, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { SessionService } from './session.service';
import { PasswordResetService, RESET_TTL_MS } from './password-reset.service';

describe('PasswordResetService', () => {
    let service: PasswordResetService;
    let resetRepo: MockRepository;
    let userRepo: MockRepository;
    let profileRepo: MockRepository;
    let mailTemplates: { render: jest.Mock };
    let outbox: { queue: jest.Mock };
    let sessions: { revokeAllForUser: jest.Mock };
    let manager: { update: jest.Mock; save: jest.Mock; create: jest.Mock };
    let transaction: jest.Mock;

    const now = new Date('2026-09-11T09:00:00.000Z');

    /** What `request` finds when it looks the address up: a profile with an account behind it. */
    function profileWithAccount(overrides: Record<string, unknown> = {}) {
        return { id: 3, firstName: 'Ana', email: 'ana@pop.ro', user: { id: 7 }, ...overrides };
    }

    beforeEach(async () => {
        resetRepo = createMockRepository();
        userRepo = createMockRepository();
        profileRepo = createMockRepository();

        profileRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: profileWithAccount() }));

        mailTemplates = {
            render: jest
                .fn()
                .mockImplementation((_key: string, vars: Record<string, string>) =>
                    Promise.resolve({ subject: 'Resetare parolă', bodyText: `Salut ${vars.firstName}: ${vars.resetUrl}`, bodyHtml: null }),
                ),
        };
        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }) };
        sessions = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };

        manager = {
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            save: jest.fn().mockImplementation((_entity: unknown, data: unknown) => Promise.resolve(data)),
            create: jest.fn().mockImplementation((_entity: unknown, data: unknown) => data),
        };
        transaction = jest.fn((run: (m: unknown) => Promise<unknown>) => run(manager));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PasswordResetService,
                provideMockRepository(PasswordReset, resetRepo),
                provideMockRepository(User, userRepo),
                provideMockRepository(Profile, profileRepo),
                { provide: MailTemplateService, useValue: mailTemplates },
                { provide: OutboxService, useValue: outbox },
                { provide: SessionService, useValue: sessions },
                { provide: getDataSourceToken(), useValue: { transaction } },
            ],
        }).compile();

        service = module.get(PasswordResetService);
    });

    describe('request', () => {
        it('writes a row and queues the mail in one transaction', async () => {
            await service.request('ana@pop.ro', now);

            expect(transaction).toHaveBeenCalledTimes(1);
            expect(manager.save).toHaveBeenCalledTimes(1);
            // The queue gets the transaction's manager, so the link and the mail stand or fall
            // together: a token with no mail is a link nobody holds.
            expect(outbox.queue).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@pop.ro' }), manager);
        });

        it('stores the hash of the token, never the token', async () => {
            await service.request('ana@pop.ro', now);

            const stored = manager.create.mock.calls[0][1] as { tokenHash: string };
            const mailed = outbox.queue.mock.calls[0][0] as { bodyText: string };
            const token = /token=([^\s&]+)/.exec(mailed.bodyText)?.[1];

            expect(token).toBeTruthy();
            expect(stored.tokenHash).toBe(PasswordResetService.hash(decodeURIComponent(token as string)));
            expect(mailed.bodyText).not.toContain(stored.tokenHash);
        });

        it('freezes the address the link went to, and expires it in an hour', async () => {
            await service.request('ana@pop.ro', now);

            const stored = manager.create.mock.calls[0][1] as { email: string; expiresAt: Date; consumedAt: Date | null };
            expect(stored.email).toBe('ana@pop.ro');
            expect(stored.expiresAt.getTime()).toBe(now.getTime() + RESET_TTL_MS);
            expect(stored.consumedAt).toBeNull();
        });

        it('kills every earlier link for the account before writing the new one', async () => {
            await service.request('ana@pop.ro', now);

            expect(manager.update).toHaveBeenCalledWith(PasswordReset, { user: { id: 7 }, consumedAt: expect.anything() }, { consumedAt: now });
            // Order matters only in that both happen; the transaction is what makes them one act.
            expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(manager.save.mock.invocationCallOrder[0]);
        });

        it('says nothing and writes nothing when the address is not on file', async () => {
            profileRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: null }));

            await expect(service.request('nimeni@pop.ro', now)).resolves.toBeUndefined();

            expect(transaction).not.toHaveBeenCalled();
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('says nothing and writes nothing when the profile has no account', async () => {
            profileRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: profileWithAccount({ user: null }) }));

            await expect(service.request('ana@pop.ro', now)).resolves.toBeUndefined();

            expect(transaction).not.toHaveBeenCalled();
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('matches the address case-insensitively', async () => {
            const qb = profileRepo.createQueryBuilder!() as MockQueryBuilder;
            profileRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.request('Ana@Pop.RO', now);

            const where = (qb.where as jest.Mock).mock.calls[0][0] as string;
            expect(where).toContain('lower(');
        });
    });

    describe('reset', () => {
        const token = 'a-token';

        /** A live link: unconsumed, an hour from now, issued to the address still on the account. */
        function liveReset(overrides: Record<string, unknown> = {}) {
            return {
                id: 11,
                tokenHash: PasswordResetService.hash(token),
                email: 'ana@pop.ro',
                expiresAt: new Date(now.getTime() + RESET_TTL_MS),
                consumedAt: null,
                user: { id: 7, profile: { email: 'ana@pop.ro' } },
                ...overrides,
            };
        }

        it('looks the link up by hash, never by the token itself', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset());

            await service.reset(token, 'parola-noua', now);

            const where = resetRepo.findOne!.mock.calls[0][0].where as { tokenHash: string };
            expect(where.tokenHash).toBe(PasswordResetService.hash(token));
            expect(where.tokenHash).not.toBe(token);
        });

        it('stores a hash of the new password, and consumes the link, in one transaction', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset());

            await service.reset(token, 'parola-noua', now);

            expect(transaction).toHaveBeenCalledTimes(1);
            const [, , changes] = manager.update.mock.calls[0] as [unknown, unknown, { passwordHash: string }];
            expect(changes.passwordHash).not.toBe('parola-noua');
            await expect(bcrypt.compare('parola-noua', changes.passwordHash)).resolves.toBe(true);
            expect(manager.update).toHaveBeenCalledWith(PasswordReset, { id: 11 }, { consumedAt: now });
        });

        it('revokes every session', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset());

            await service.reset(token, 'parola-noua', now);

            expect(sessions.revokeAllForUser).toHaveBeenCalledWith(7);
        });

        it('refuses an unknown token', async () => {
            resetRepo.findOne!.mockResolvedValue(null);

            await expect(service.reset(token, 'parola-noua', now)).rejects.toThrow(BadRequestException);
            expect(transaction).not.toHaveBeenCalled();
        });

        it('refuses a link that has already been used', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset({ consumedAt: new Date(now.getTime() - 1000) }));

            await expect(service.reset(token, 'parola-noua', now)).rejects.toThrow(BadRequestException);
            expect(transaction).not.toHaveBeenCalled();
        });

        it('refuses a link that has expired, to the second', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset({ expiresAt: new Date(now.getTime()) }));

            await expect(service.reset(token, 'parola-noua', now)).rejects.toThrow(BadRequestException);
            expect(transaction).not.toHaveBeenCalled();
        });

        it('accepts a link with a second left on it', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset({ expiresAt: new Date(now.getTime() + 1000) }));

            await expect(service.reset(token, 'parola-noua', now)).resolves.toBeUndefined();
        });

        it('refuses a link issued to an address the account no longer has', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset({ user: { id: 7, profile: { email: 'noua@pop.ro' } } }));

            await expect(service.reset(token, 'parola-noua', now)).rejects.toThrow(BadRequestException);
            expect(transaction).not.toHaveBeenCalled();
        });

        it('accepts a link whose address differs only in case', async () => {
            resetRepo.findOne!.mockResolvedValue(liveReset({ user: { id: 7, profile: { email: 'Ana@Pop.RO' } } }));

            await expect(service.reset(token, 'parola-noua', now)).resolves.toBeUndefined();
        });

        it('gives every refusal the same code, so nothing can be told apart from outside', async () => {
            const codes: string[] = [];
            const cases = [null, liveReset({ consumedAt: now }), liveReset({ expiresAt: now }), liveReset({ user: { id: 7, profile: { email: 'x@pop.ro' } } })];

            for (const row of cases) {
                resetRepo.findOne!.mockResolvedValue(row);
                await service.reset(token, 'parola-noua', now).catch((error: BadRequestException) => {
                    codes.push((error.getResponse() as { error: string }).error);
                });
            }

            expect(codes).toEqual(['RESET_TOKEN_INVALID', 'RESET_TOKEN_INVALID', 'RESET_TOKEN_INVALID', 'RESET_TOKEN_INVALID']);
        });
    });

    describe('change', () => {
        let qb: MockQueryBuilder;

        beforeEach(async () => {
            const passwordHash = await bcrypt.hash('parola-veche', 10);
            qb = createMockQueryBuilder({ one: { id: 7, passwordHash } });
            userRepo.createQueryBuilder!.mockReturnValue(qb);
        });

        it('asks for the hash by name, because the column is select: false', async () => {
            await service.change(7, 'parola-veche', 'parola-noua');

            expect(qb.addSelect).toHaveBeenCalledWith('user.passwordHash');
        });

        it('stores the new password hashed, and revokes every session', async () => {
            await service.change(7, 'parola-veche', 'parola-noua');

            const [, changes] = userRepo.update!.mock.calls[0] as [unknown, { passwordHash: string }];
            await expect(bcrypt.compare('parola-noua', changes.passwordHash)).resolves.toBe(true);
            expect(sessions.revokeAllForUser).toHaveBeenCalledWith(7);
        });

        it('refuses a wrong current password, and changes nothing', async () => {
            await expect(service.change(7, 'gresita', 'parola-noua')).rejects.toThrow(BadRequestException);

            expect(userRepo.update).not.toHaveBeenCalled();
            expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
        });

        it('refuses when the account is gone', async () => {
            userRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: null }));

            await expect(service.change(7, 'parola-veche', 'parola-noua')).rejects.toThrow(BadRequestException);
            expect(userRepo.update).not.toHaveBeenCalled();
        });
    });
});
