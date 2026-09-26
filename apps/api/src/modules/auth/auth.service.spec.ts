import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { MailTemplate } from 'src/entities/mail-template.entity';
import { User } from 'src/entities/user.entity';
import { jwtConstants } from 'src/constants/jwtConstants';
import {
    createMockEntityManager,
    createMockInsertBuilder,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { SessionService } from './session.service';
import { Profile } from 'src/entities/profile.entity';
import { DocumentAcceptance } from 'src/entities/document-acceptance.entity';
import { LEGAL_DOCUMENT_VERSIONS } from './legal-documents';
import { EmailConfirmationService } from './email-confirmation.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { Role } from 'src/enum/role.enum';
import { LegalDocument } from 'src/enum/legal-document.enum';
import { AccountClaimService } from './account-claim.service';
import { AuditService } from 'src/modules/audit/audit.service';

/**
 * Everything `register` now requires, so each test can say only what it is about.
 *
 * E11/S2 turned a two-field DTO into a ten-field one, and a test that spelled all ten out every
 * time would bury the single field it cares about among nine that never vary.
 */
/** Exactly what `RegisterDto` accepts since the split — see the note on that class. */
const REGISTRATION = {
    username: 'ana',
    password: 'parola-secreta',
    firstName: 'Ana',
    lastName: 'Popescu',
    email: 'ana@example.com',
    acceptedTerms: true,
    acceptedUnusualClauses: true,
};

describe('AuthService', () => {
    let service: AuthService;
    let jwtService: JwtService;
    let userRepo: MockRepository;
    let profileRepo: MockRepository;
    let acceptanceRepo: MockRepository;
    let sessions: Record<string, jest.Mock>;
    let confirmations: Record<string, jest.Mock>;
    let outbox: Record<string, jest.Mock>;
    let claims: Record<string, jest.Mock>;
    let audit: { recordPersonalDataChange: jest.Mock };
    let manager: MockEntityManager;

    /** What `manager.save` was handed for a given entity, in call order. */
    const saved = (entity: unknown): Record<string, unknown>[] =>
        manager.save.mock.calls.filter((call) => call[0] === entity).map((call) => call[1] as Record<string, unknown>);

    /** The last builder `userRepo.createQueryBuilder` handed out, for asserting what it selected. */
    let userQueryBuilder: Record<string, jest.Mock> = {};

    beforeEach(async () => {
        userRepo = createMockRepository();
        profileRepo = createMockRepository();
        acceptanceRepo = createMockRepository();
        // An account that has accepted nothing, unless a test says otherwise.
        acceptanceRepo.find!.mockResolvedValue([]);

        // `register` and `login` look the user up case-insensitively, which needs a query builder
        // rather than `findOne`. The builder's `getOne` delegates to the same `findOne` mock, so
        // every test below still says "the repository holds this user" in one place, and the
        // recorded `where` clause stays assertable.
        userRepo.createQueryBuilder!.mockImplementation(() => {
            const qb: Record<string, jest.Mock> = {};
            // `passwordHash` is `select: false`, so `login` has to ask for it by name.
            qb.addSelect = jest.fn().mockReturnValue(qb);
            qb.where = jest.fn().mockReturnValue(qb);
            qb.andWhere = jest.fn().mockReturnValue(qb);
            qb.getOne = jest.fn(() => userRepo.findOne!() as Promise<unknown>);
            userQueryBuilder = qb;
            return qb;
        });

        // No profile holds the address or the phone number, unless a test says otherwise.
        profileRepo.findOne!.mockResolvedValue(null);
        profileRepo.createQueryBuilder!.mockImplementation(() => {
            const qb: Record<string, jest.Mock> = {};
            qb.where = jest.fn().mockReturnValue(qb);
            qb.andWhere = jest.fn().mockReturnValue(qb);
            qb.getOne = jest.fn(() => profileRepo.findOne!() as Promise<unknown>);
            return qb;
        });

        confirmations = {
            issueFor: jest.fn().mockResolvedValue({ token: 'tok-123', expiresAt: new Date() }),
            // The composition — row, token, rendered link, queued message — belongs to
            // `EmailConfirmationService` and is tested there. What matters here is that the two
            // callers hand it the right address and their own transaction manager.
            issueAndSend: jest.fn().mockResolvedValue(undefined),
            confirm: jest.fn(),
            countPending: jest.fn().mockResolvedValue(0),
            findLiveFor: jest.fn().mockResolvedValue([]),
        };

        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }), queueOrRecord: jest.fn().mockResolvedValue({ id: 2 }) };
        claims = { accountlessProfileFor: jest.fn().mockResolvedValue(null), issue: jest.fn(), redeem: jest.fn() };
        audit = { recordPersonalDataChange: jest.fn() };
        // The acceptance ledger is written through the transaction's manager (terms §4.7 queues its
        // confirmation in the same transaction), so the manager hands back the same double.
        manager = createMockEntityManager(new Map([[DocumentAcceptance, acceptanceRepo]]));

        sessions = {
            startSession: jest.fn(),
            rotate: jest.fn(),
            revoke: jest.fn(),
            revokeAllForUser: jest.fn(),
            listActive: jest.fn().mockResolvedValue([]),
        };

        // A real JwtService, not a mock: issued tokens must be verifiable, and the expiry test
        // would be meaningless against a mock.
        const module: TestingModule = await Test.createTestingModule({
            imports: [JwtModule.register({})],
            providers: [
                AuthService,
                provideMockRepository(User, userRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockRepository(DocumentAcceptance, acceptanceRepo),
                { provide: SessionService, useValue: sessions },
                { provide: EmailConfirmationService, useValue: confirmations },
                { provide: OutboxService, useValue: outbox },
                // No office-entered family holds the address unless a test says so.
                { provide: AccountClaimService, useValue: claims },
                { provide: AuditService, useValue: audit },
                // The real template service over a repo with no overrides: the wording assertions
                // below then hold against the shipped defaults, which is what actually goes out.
                MailTemplateService,
                provideMockRepository(MailTemplate, createMockRepository()),
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(AuthService);
        jwtService = module.get(JwtService);
    });

    describe('register', () => {
        /** Tokens, as a registration on a fresh address answers — never the claim-link shape here. */
        const registered = async () => {
            const result = await service.register(REGISTRATION);
            if (!('accessToken' in result)) throw new Error('Expected tokens, got a claim link');
            return result;
        };

        /** Registration writes through the transaction manager, so the user comes back with an id. */
        const registrationSucceeds = () => {
            userRepo.findOne!.mockResolvedValue(null);
            manager.save.mockImplementation((entity: unknown, data: Record<string, unknown> | Record<string, unknown>[]) => {
                if (entity === User) return Promise.resolve({ id: 7, ...data });
                // The ledger rows come back with their ids, as TypeORM hands them back after an
                // insert: the confirmation of the agreement is keyed on them.
                if (entity === DocumentAcceptance && Array.isArray(data)) return Promise.resolve(data.map((row, index) => ({ id: 11 + index, ...row })));
                return Promise.resolve(data);
            });
        };

        it('records the version of each document the parent accepted, in the same transaction as the account', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            const [rows] = saved(DocumentAcceptance) as unknown as { user: { id: number }; document: string; version: string }[][];
            expect(rows.map(({ document, version }) => ({ document, version }))).toEqual([
                { document: 'terms', version: LEGAL_DOCUMENT_VERSIONS.terms },
                { document: 'privacy', version: LEGAL_DOCUMENT_VERSIONS.privacy },
                // The third row is the express, separate acceptance Cod civil art. 1203 asks for
                // on §14, §15 and §18. Recorded as its own row so that "did they accept the
                // clauses" is a question the ledger answers, not one inferred from the terms row.
                { document: 'unusual_clauses', version: LEGAL_DOCUMENT_VERSIONS.unusual_clauses },
            ]);
            expect(rows.every((row) => row.user.id === 7)).toBe(true);
        });

        it('stores the password as a bcrypt hash, never in clear text', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            const [user] = saved(User);
            const passwordHash = user.passwordHash as string;
            expect(passwordHash).not.toBe(REGISTRATION.password);
            expect(passwordHash).toMatch(/^\$2[aby]\$/);
            await expect(bcrypt.compare(REGISTRATION.password, passwordHash)).resolves.toBe(true);
        });

        it('always creates a PARENT, even when the request asks for something else', async () => {
            registrationSucceeds();

            await service.register({ ...REGISTRATION, role: 'ADMIN' } as never);

            expect(saved(User)[0]).toMatchObject({ role: 'PARENT' });
        });

        it('starts the account with both gates shut', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            // The whole of E11/S2 in one assertion: a fresh account is neither confirmed nor
            // approved, and `isAccountActive` therefore says no.
            expect(saved(User)[0]).toMatchObject({
                emailConfirmedAt: null,
                approvalStatus: ApprovalStatus.PENDING,
            });
        });

        it('writes a shell profile — the name and the address the link goes to, and nothing else', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            // Step two collects the rest, and it is not optional: `isProfileComplete` gates a
            // child's placement on it. Asserted as the exact object rather than a subset, because
            // the point of this test is what is *absent* — a field creeping back in here is the
            // ten-field first screen returning one line at a time.
            const profile = saved(Profile)[0];
            expect(profile).toMatchObject({ firstName: 'Ana', lastName: 'Popescu', email: 'ana@example.com' });
            expect(profile).not.toHaveProperty('phone');
            expect(profile).not.toHaveProperty('address');
            expect(profile).not.toHaveProperty('emergencyContactName');
            expect(profile).not.toHaveProperty('emergencyContactRelation');
            expect(profile).not.toHaveProperty('emergencyContactPhone');
        });

        it('writes the user, the profile, the token and both emails through one transaction manager', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            // The point of the transaction: a profile without its user is a family nobody can sign
            // in as, and a "confirm your address" mail for a rolled-back registration is a link
            // that 400s on a parent who did as they were told.
            expect(saved(User)).toHaveLength(1);
            expect(saved(Profile)).toHaveLength(1);
            expect(confirmations.issueAndSend).toHaveBeenCalledWith(
                expect.anything(),
                { firstName: 'Ana', email: 'ana@example.com' },
                expect.any(Date),
                manager,
            );
            for (const call of outbox.queue.mock.calls) {
                expect(call[1]).toBe(manager);
            }
        });

        // Terms §4.7: "primești și un email de confirmare" — the agreement just concluded, confirmed.
        it('confirms the agreement by email, to the address being confirmed, in the same transaction', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith(
                // No `confirmed` flag: the address is the one the confirmation link goes to, and
                // gating on the confirmation would record the promised message as undeliverable.
                { email: 'ana@example.com', confirmed: undefined },
                expect.objectContaining({
                    subject: 'Ai acceptat termenii IT Bridge School',
                    bodyText: expect.stringContaining(`Termenii și condițiile, versiunea ${LEGAL_DOCUMENT_VERSIONS.terms}`),
                    // One message per acceptance written: the key is the account and the ledger rows.
                    dedupeKey: 'legal-acceptance:7:11-12-13',
                }),
                manager,
            );
        });

        it('tells the office that somebody is waiting for approval', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            // E11 names the failure this prevents: an admin who never opens the approvals screen
            // turns an enrolment into silence, and the family cannot tell that from a broken site.
            const toOffice = outbox.queue.mock.calls.find((call) => (call[0] as { to: string }).to !== 'ana@example.com');
            expect(toOffice).toBeDefined();
            expect((toOffice?.[0] as { subject: string }).subject).toContain('Ana Popescu');
        });

        it('rejects a username that is already taken', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 1, username: 'ana' });

            await expect(service.register(REGISTRATION)).rejects.toThrow(ConflictException);
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('checks the profile table once, for the email — the phone is no longer its business', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            // Two lookups under the old flow: the email through the query builder, then the phone
            // through `findOne`. Registration does not collect a phone any more, so the second one
            // has no input; it moved to `ProfileService.updateProfile`, where the number is typed,
            // and runs against the same unique column. Counting the calls is the only way to say
            // this here — the harness backs `getOne` with `findOne`, so both reads look alike.
            expect(profileRepo.findOne).toHaveBeenCalledTimes(1);
        });

        it('rejects an email address that already belongs to another family', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            profileRepo.findOne!.mockResolvedValue({ id: 4, email: 'ana@example.com' });

            // Both columns are unique, so the database would refuse this anyway — as a 500 out of
            // the driver. Checked here so the parent is told which field to change.
            await expect(service.register(REGISTRATION)).rejects.toMatchObject({
                response: { error: 'EMAIL_TAKEN' },
            });
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('queues nothing when the registration is refused', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 1, username: 'ana' });

            await service.register(REGISTRATION).catch(() => undefined);

            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('returns a valid pair of tokens', async () => {
            registrationSucceeds();

            const result = await registered();

            const access = jwtService.verify(result.accessToken, { secret: jwtConstants.accessTokenSecret });
            expect(access).toMatchObject({ sub: 7, username: 'ana', role: 'PARENT' });

            const refresh = jwtService.verify(result.refreshToken, { secret: jwtConstants.refreshTokenSecret });
            expect(refresh).toMatchObject({ sub: 7 });
        });

        it('does not put the role in the refresh token', async () => {
            registrationSucceeds();

            const { refreshToken } = await registered();
            const payload = jwtService.verify<Record<string, unknown>>(refreshToken, {
                secret: jwtConstants.refreshTokenSecret,
            });

            expect(payload.role).toBeUndefined();
            expect(payload.username).toBeUndefined();
        });
    });

    /**
     * A family the office typed in (E11 S2, review of 26 September 2026): `register` sends the link
     * instead of writing a second family, and `claimAccount` puts the account on the office's row.
     */
    describe('a family the office typed in', () => {
        const officeRow = { id: 40, firstName: 'Ana', lastName: 'Popescu', email: 'ana@example.com', phone: null, user: null, erasedAt: null };
        const CLAIM = { token: 'claim-token', username: 'ana.popescu', password: 'parola-noua', acceptedTerms: true, acceptedUnusualClauses: true };

        it('sends the claim link instead of writing a second account and profile', async () => {
            claims.accountlessProfileFor!.mockResolvedValue(officeRow);

            const result = await service.register(REGISTRATION);

            expect(result).toEqual({ claimSent: true, message: expect.any(String) });
            expect(claims.issue).toHaveBeenCalledWith(officeRow, expect.any(Date), manager);
            expect(saved(User)).toEqual([]);
            expect(sessions.startSession).not.toHaveBeenCalled();
        });

        it('refuses a username somebody already has, before spending the link', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana.popescu' });

            await expect(service.claimAccount(CLAIM)).rejects.toMatchObject({ response: { error: 'USERNAME_TAKEN' } });
            expect(claims.redeem).not.toHaveBeenCalled();
        });

        it('writes nothing when the link cannot be spent', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            claims.redeem!.mockRejectedValue(new Error('CLAIM_TOKEN_INVALID'));

            await expect(service.claimAccount(CLAIM)).rejects.toThrow('CLAIM_TOKEN_INVALID');
            expect(saved(User)).toEqual([]);
            expect(sessions.startSession).not.toHaveBeenCalled();
        });

        it('creates the account on the office’s row: confirmed, still waiting for approval, with the acceptances and a trail', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            claims.redeem!.mockResolvedValue(officeRow);
            manager.save.mockImplementation((entity: unknown, data: Record<string, unknown> | Record<string, unknown>[]) => {
                if (entity === User) return Promise.resolve({ id: 9, ...data });
                if (entity === DocumentAcceptance && Array.isArray(data)) return Promise.resolve(data.map((row, index) => ({ id: 21 + index, ...row })));
                return Promise.resolve(data);
            });

            const result = await service.claimAccount(CLAIM, 'Firefox');

            expect(claims.redeem).toHaveBeenCalledWith('claim-token', expect.any(Date), manager);
            const [user] = saved(User);
            expect(user).toMatchObject({ username: 'ana.popescu', role: Role.PARENT, approvalStatus: ApprovalStatus.PENDING });
            expect(user.emailConfirmedAt).toBeInstanceOf(Date);
            await expect(bcrypt.compare('parola-noua', user.passwordHash as string)).resolves.toBe(true);
            expect(manager.update).toHaveBeenCalledWith(Profile, { id: 40 }, { user: { id: 9 } });
            const [rows] = saved(DocumentAcceptance) as unknown as { document: string }[][];
            expect(rows.map((row) => row.document)).toEqual(['terms', 'privacy', 'unusual_clauses']);
            expect(audit.recordPersonalDataChange).toHaveBeenCalledWith(
                expect.objectContaining({ actor: { userId: 9, username: 'ana.popescu' }, entityType: 'Profile', entityId: 40, fields: ['user'] }),
                manager,
            );
            expect(sessions.startSession).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }), expect.any(String), expect.any(Date), 'Firefox');
            expect(result).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
        });
    });

    describe('confirmEmail', () => {
        it('reports both gates, not just the one it opened', async () => {
            confirmations.confirm.mockResolvedValue({ id: 7, role: 'PARENT', emailConfirmedAt: new Date(), approvalStatus: ApprovalStatus.PENDING });

            // "Confirmed" is not "usable". Telling a parent to go and sign in when an admin has not
            // approved them yet would be a worse kind of wrong than saying nothing.
            await expect(service.confirmEmail('tok-abc')).resolves.toMatchObject({
                emailConfirmed: true,
                approvalStatus: ApprovalStatus.PENDING,
                active: false,
            });
        });

        it('reports the account as active once an admin has also approved', async () => {
            confirmations.confirm.mockResolvedValue({ id: 7, role: 'PARENT', emailConfirmedAt: new Date(), approvalStatus: ApprovalStatus.APPROVED });

            await expect(service.confirmEmail('tok-abc')).resolves.toMatchObject({ active: true });
        });
    });

    describe('resendConfirmation', () => {
        it('sends to the address on file, never to one supplied by the caller', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 7, emailConfirmedAt: null });
            profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: 'ana@example.com' });

            await service.resendConfirmation(7);

            // The method takes no address for exactly this reason: one that did would let anyone
            // holding a session point a confirmation at a mailbox of their choosing.
            expect(confirmations.issueAndSend).toHaveBeenCalledWith(
                expect.anything(),
                { firstName: 'Ana', email: 'ana@example.com' },
                expect.any(Date),
                manager,
            );
        });

        it('refuses when the address is already confirmed', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 7, emailConfirmedAt: new Date() });

            await expect(service.resendConfirmation(7)).rejects.toMatchObject({
                response: { error: 'EMAIL_ALREADY_CONFIRMED' },
            });
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('refuses when there is no address on file', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 7, emailConfirmedAt: null });
            profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: null });

            // The admin-typed-it-in-from-a-phone-call profile. Nothing to send to, and saying so is
            // better than queueing a message addressed to nobody.
            await expect(service.resendConfirmation(7)).rejects.toMatchObject({
                response: { error: 'NO_EMAIL_ON_FILE' },
            });
            expect(outbox.queue).not.toHaveBeenCalled();
        });

        it('404s on a user that does not exist', async () => {
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.resendConfirmation(99)).rejects.toThrow(NotFoundException);
        });
    });

    describe('login', () => {
        const withUser = async (password: string) => {
            const passwordHash = await bcrypt.hash(password, 10);
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', passwordHash, role: 'PARENT' });
        };

        it('asks for the hash by name — the column is select: false and this is its one reader', async () => {
            await withUser('parola123');

            await service.login({ username: 'ana', password: 'parola123' });

            expect(userQueryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
        });

        it('accepts the correct password', async () => {
            await withUser('corecta');
            await expect(service.login({ username: 'ana', password: 'corecta' })).resolves.toMatchObject({
                message: 'Login successful',
            });
        });

        it('rejects a wrong password', async () => {
            await withUser('corecta');
            await expect(service.login({ username: 'ana', password: 'gresita' })).rejects.toThrow(UnauthorizedException);
        });

        it('rejects a user that does not exist', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            await expect(service.login({ username: 'nimeni', password: 'x' })).rejects.toThrow(UnauthorizedException);
        });

        it('does not distinguish an unknown user from a wrong password', async () => {
            // Different messages would allow account enumeration.
            userRepo.findOne!.mockResolvedValue(null);
            const absent = await service.login({ username: 'nimeni', password: 'x' }).catch((e: Error) => e.message);

            await withUser('corecta');
            const wrong = await service.login({ username: 'ana', password: 'gresita' }).catch((e: Error) => e.message);

            expect(absent).toBe(wrong);
        });
    });

    describe('refreshToken', () => {
        it('issues a fresh access token carrying the current role from the database', async () => {
            const refreshToken = jwtService.sign({ sub: 3 }, { secret: jwtConstants.refreshTokenSecret });
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', role: 'ADMIN' });

            const { accessToken } = await service.refreshToken({ refreshToken });

            expect(jwtService.verify(accessToken, { secret: jwtConstants.accessTokenSecret })).toMatchObject({
                sub: 3,
                role: 'ADMIN',
            });
        });

        it('rejects a token signed with a different secret', async () => {
            const foreign = jwtService.sign({ sub: 3 }, { secret: 'alt-secret' });
            await expect(service.refreshToken({ refreshToken: foreign })).rejects.toThrow(UnauthorizedException);
        });

        it('rejects an access token used as a refresh token', async () => {
            const access = jwtService.sign({ sub: 3, role: 'ADMIN' }, { secret: jwtConstants.accessTokenSecret });
            await expect(service.refreshToken({ refreshToken: access })).rejects.toThrow(UnauthorizedException);
        });

        it('rejects an expired token', async () => {
            const expired = jwtService.sign({ sub: 3 }, { secret: jwtConstants.refreshTokenSecret, expiresIn: '-1s' });
            await expect(service.refreshToken({ refreshToken: expired })).rejects.toThrow(UnauthorizedException);
        });

        it('rejects a valid token whose user has been deleted', async () => {
            const refreshToken = jwtService.sign({ sub: 3 }, { secret: jwtConstants.refreshTokenSecret });
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.refreshToken({ refreshToken })).rejects.toThrow(UnauthorizedException);
        });

        it('rejects garbage', async () => {
            await expect(service.refreshToken({ refreshToken: 'nu-e-un-jwt' })).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('getUserProfile', () => {
        it('never selects passwordHash', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', role: 'PARENT' });

            await service.getUserProfile(3);

            const select = (userRepo.findOne!.mock.calls[0][0] as { select: string[] }).select;
            expect(select).not.toContain('passwordHash');
        });

        it('carries the state of both gates, because every page of the portal needs it', async () => {
            userRepo.findOne!.mockResolvedValue({
                id: 3,
                username: 'ana',
                role: 'PARENT',
                emailConfirmedAt: null,
                approvalStatus: ApprovalStatus.PENDING,
            });

            await expect(service.getUserProfile(3)).resolves.toMatchObject({
                emailConfirmed: false,
                approvalStatus: ApprovalStatus.PENDING,
                active: false,
            });
        });

        it('returns null for a user that is gone, rather than a half-built object', async () => {
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.getUserProfile(99)).resolves.toBeNull();
        });

        it('names every document a parent has not accepted in the version in force — E22 S4', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', role: 'PARENT', emailConfirmedAt: null, approvalStatus: ApprovalStatus.PENDING });
            acceptanceRepo.find!.mockResolvedValue([{ document: LegalDocument.PRIVACY, version: LEGAL_DOCUMENT_VERSIONS.privacy }]);

            await expect(service.getUserProfile(3)).resolves.toMatchObject({
                pendingLegalDocuments: [LegalDocument.TERMS, LegalDocument.UNUSUAL_CLAUSES],
            });
        });

        it('asks the ledger only about the caller', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', role: 'PARENT', emailConfirmedAt: null, approvalStatus: ApprovalStatus.PENDING });

            await service.getUserProfile(3);

            expect(acceptanceRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { user: { id: 3 } } }));
        });

        it('asks nothing of an admin, who is the school rather than a family', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 1, username: 'admin', role: 'ADMIN', emailConfirmedAt: null, approvalStatus: ApprovalStatus.PENDING });

            await expect(service.getUserProfile(1)).resolves.toMatchObject({ pendingLegalDocuments: [] });
            // Not merely empty — never asked. A version bump must not be able to lock the only
            // people who could fix it out of the admin area.
            expect(acceptanceRepo.find).not.toHaveBeenCalled();
        });
    });

    describe('acceptDocuments', () => {
        const parent = { id: 3, username: 'ana', role: 'PARENT' };
        /** The `.insert().values().orIgnore().execute()` chain the write goes through. */
        let insertBuilder: ReturnType<typeof createMockInsertBuilder>;

        beforeEach(() => {
            insertBuilder = createMockInsertBuilder([]);
            acceptanceRepo.createQueryBuilder!.mockReturnValue(insertBuilder);
        });

        it('writes a row for each outstanding document, in the version in force', async () => {
            userRepo.findOne!.mockResolvedValue(parent);
            acceptanceRepo.find!.mockResolvedValue([{ document: LegalDocument.PRIVACY, version: LEGAL_DOCUMENT_VERSIONS.privacy }]);

            await service.acceptDocuments(3, { documents: [LegalDocument.TERMS, LegalDocument.PRIVACY, LegalDocument.UNUSUAL_CLAUSES] });

            expect(insertBuilder.values).toHaveBeenCalledWith([
                { user: { id: 3 }, document: LegalDocument.TERMS, version: LEGAL_DOCUMENT_VERSIONS.terms },
                { user: { id: 3 }, document: LegalDocument.UNUSUAL_CLAUSES, version: LEGAL_DOCUMENT_VERSIONS.unusual_clauses },
            ]);
            // `ON CONFLICT DO NOTHING` against the unique constraint: the second submit of a
            // double-click is not an error to show a family who did accept.
            expect(insertBuilder.orIgnore).toHaveBeenCalled();
        });

        it('confirms a newly accepted version by email, keyed on the rows it confirms', async () => {
            userRepo.findOne!.mockResolvedValue(parent);
            acceptanceRepo.find!.mockResolvedValue([]);
            insertBuilder = createMockInsertBuilder([
                { id: 12, document: LegalDocument.PRIVACY },
                { id: 11, document: LegalDocument.TERMS },
                { id: 13, document: LegalDocument.UNUSUAL_CLAUSES },
            ]);
            acceptanceRepo.createQueryBuilder!.mockReturnValue(insertBuilder);
            manager.findOne = jest.fn((entity: unknown) =>
                Promise.resolve(entity === User ? { id: 3, emailConfirmedAt: new Date() } : { firstName: 'Ana', email: 'ana@example.com' }),
            );

            await service.acceptDocuments(3, { documents: [LegalDocument.TERMS, LegalDocument.PRIVACY, LegalDocument.UNUSUAL_CLAUSES] });

            expect(outbox.queueOrRecord).toHaveBeenCalledWith(
                // Gated on the confirmation like every other message to a family: re-acceptance
                // happens after registration, so an address nobody proved is recorded, not written to.
                { email: 'ana@example.com', confirmed: true },
                expect.objectContaining({ subject: 'Ai acceptat termenii IT Bridge School', dedupeKey: 'legal-acceptance:3:11-12-13' }),
                manager,
            );
        });

        it('names only what this submit wrote, not what it asked for', async () => {
            userRepo.findOne!.mockResolvedValue(parent);
            // A new privacy notice: the terms and the clauses stand as accepted earlier.
            acceptanceRepo.find!.mockResolvedValue([
                { document: LegalDocument.TERMS, version: LEGAL_DOCUMENT_VERSIONS.terms },
                { document: LegalDocument.UNUSUAL_CLAUSES, version: LEGAL_DOCUMENT_VERSIONS.unusual_clauses },
            ]);
            insertBuilder = createMockInsertBuilder([{ id: 21, document: LegalDocument.PRIVACY }]);
            acceptanceRepo.createQueryBuilder!.mockReturnValue(insertBuilder);
            manager.findOne = jest.fn((entity: unknown) =>
                Promise.resolve(entity === User ? { id: 3, emailConfirmedAt: new Date() } : { firstName: 'Ana', email: 'ana@example.com' }),
            );

            await service.acceptDocuments(3, { documents: [LegalDocument.TERMS, LegalDocument.PRIVACY, LegalDocument.UNUSUAL_CLAUSES] });

            const [, message] = outbox.queueOrRecord.mock.calls[0] as [unknown, { bodyText: string; dedupeKey: string }];
            // The terms were accepted on another day; saying they were accepted today would be the
            // one thing a confirmation of an agreement must not get wrong.
            const acceptedLine = message.bodyText.split('\n').find((line) => line.startsWith('Îți confirmăm'));
            expect(acceptedLine).toContain(`Politica de confidențialitate, versiunea ${LEGAL_DOCUMENT_VERSIONS.privacy}`);
            expect(acceptedLine).not.toContain('Termenii');
            expect(message.dedupeKey).toBe('legal-acceptance:3:21');
        });

        // The second click of a double-click wrote nothing, and its family already has the message.
        it('sends nothing when the insert wrote nothing', async () => {
            userRepo.findOne!.mockResolvedValue(parent);
            acceptanceRepo.find!.mockResolvedValue([]);

            await service.acceptDocuments(3, { documents: [LegalDocument.TERMS, LegalDocument.PRIVACY, LegalDocument.UNUSUAL_CLAUSES] });

            expect(insertBuilder.execute).toHaveBeenCalled();
            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('refuses a list that leaves the unusual clauses unaccepted', async () => {
            userRepo.findOne!.mockResolvedValue(parent);

            // Cod civil art. 1203 is the whole reason this case exists: ticking the terms and not
            // the clauses inside them is a request that must not half-succeed.
            await expect(service.acceptDocuments(3, { documents: [LegalDocument.TERMS, LegalDocument.PRIVACY] })).rejects.toMatchObject({
                response: { error: 'LEGAL_ACCEPTANCE_INCOMPLETE' },
            });
            expect(insertBuilder.execute).not.toHaveBeenCalled();
        });

        it('writes nothing when everything is already accepted, so a second click keeps the first day', async () => {
            userRepo.findOne!.mockResolvedValue(parent);
            acceptanceRepo.find!.mockResolvedValue(
                Object.entries(LEGAL_DOCUMENT_VERSIONS).map(([document, version]) => ({ document: document as LegalDocument, version })),
            );

            await service.acceptDocuments(3, { documents: [LegalDocument.TERMS, LegalDocument.PRIVACY, LegalDocument.UNUSUAL_CLAUSES] });

            expect(insertBuilder.execute).not.toHaveBeenCalled();
        });

        it('404s on a user that is gone rather than writing rows against an id', async () => {
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.acceptDocuments(99, { documents: [LegalDocument.TERMS] })).rejects.toThrow(NotFoundException);
            expect(insertBuilder.execute).not.toHaveBeenCalled();
        });
    });

    describe('sessions', () => {
        // Thin delegations, but they are the whole of "log out actually logs you out" (E05/S7) and
        // nothing else asserted that they reach the session service at all.
        it('logout revokes the presented refresh token', async () => {
            await service.logout('r');
            expect(sessions.revoke).toHaveBeenCalledWith('r');
        });

        it('logout-all revokes only the calling user', async () => {
            await service.logoutEverywhere(7);
            expect(sessions.revokeAllForUser).toHaveBeenCalledWith(7);
        });

        it('listing sessions asks only for the calling user', async () => {
            await service.listSessions(7);
            expect(sessions.listActive).toHaveBeenCalledWith(7, undefined);
        });
    });
});
