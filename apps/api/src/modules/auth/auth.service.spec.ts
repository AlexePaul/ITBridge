import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from 'src/entities/user.entity';
import { jwtConstants } from 'src/constants/jwtConstants';
import {
    createMockEntityManager,
    createMockRepository,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { SessionService } from './session.service';
import { Profile } from 'src/entities/profile.entity';
import { EmailConfirmationService } from './email-confirmation.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { ApprovalStatus } from 'src/enum/approval-status.enum';

/**
 * Everything `register` now requires, so each test can say only what it is about.
 *
 * E11/S2 turned a two-field DTO into a ten-field one, and a test that spelled all ten out every
 * time would bury the single field it cares about among nine that never vary.
 */
const REGISTRATION = {
    username: 'ana',
    password: 'parola-secreta',
    firstName: 'Ana',
    lastName: 'Popescu',
    email: 'ana@example.com',
    phone: '0712345678',
    address: 'Str. Exemplu 12, București',
    emergencyContactName: 'Maria Popescu',
    emergencyContactRelation: 'bunica',
    emergencyContactPhone: '0723456789',
};

describe('AuthService', () => {
    let service: AuthService;
    let jwtService: JwtService;
    let userRepo: MockRepository;
    let profileRepo: MockRepository;
    let sessions: Record<string, jest.Mock>;
    let confirmations: Record<string, jest.Mock>;
    let outbox: Record<string, jest.Mock>;
    let manager: MockEntityManager;

    /** What `manager.save` was handed for a given entity, in call order. */
    const saved = (entity: unknown): Record<string, unknown>[] =>
        manager.save.mock.calls.filter((call) => call[0] === entity).map((call) => call[1] as Record<string, unknown>);

    beforeEach(async () => {
        userRepo = createMockRepository();
        profileRepo = createMockRepository();

        // `register` and `login` look the user up case-insensitively, which needs a query builder
        // rather than `findOne`. The builder's `getOne` delegates to the same `findOne` mock, so
        // every test below still says "the repository holds this user" in one place, and the
        // recorded `where` clause stays assertable.
        userRepo.createQueryBuilder!.mockImplementation(() => {
            const qb: Record<string, jest.Mock> = {};
            qb.where = jest.fn().mockReturnValue(qb);
            qb.andWhere = jest.fn().mockReturnValue(qb);
            qb.getOne = jest.fn(() => userRepo.findOne!() as Promise<unknown>);
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
            confirm: jest.fn(),
            countPending: jest.fn().mockResolvedValue(0),
            findLiveFor: jest.fn().mockResolvedValue([]),
        };

        outbox = { queue: jest.fn().mockResolvedValue({ id: 1 }) };
        manager = createMockEntityManager();

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
                { provide: SessionService, useValue: sessions },
                { provide: EmailConfirmationService, useValue: confirmations },
                { provide: OutboxService, useValue: outbox },
                provideMockDataSource(manager),
            ],
        }).compile();

        service = module.get(AuthService);
        jwtService = module.get(JwtService);
    });

    describe('register', () => {
        /** Registration writes through the transaction manager, so the user comes back with an id. */
        const registrationSucceeds = () => {
            userRepo.findOne!.mockResolvedValue(null);
            manager.save.mockImplementation((entity: unknown, data: Record<string, unknown>) => Promise.resolve(entity === User ? { id: 7, ...data } : data));
        };

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

        it('writes the contact details and the emergency contact onto a profile', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            expect(saved(Profile)[0]).toMatchObject({
                firstName: 'Ana',
                lastName: 'Popescu',
                email: 'ana@example.com',
                phone: '0712345678',
                address: 'Str. Exemplu 12, București',
                emergencyContactName: 'Maria Popescu',
                emergencyContactRelation: 'bunica',
                emergencyContactPhone: '0723456789',
            });
        });

        it('writes the user, the profile, the token and both emails through one transaction manager', async () => {
            registrationSucceeds();

            await service.register(REGISTRATION);

            // The point of the transaction: a profile without its user is a family nobody can sign
            // in as, and a "confirm your address" mail for a rolled-back registration is a link
            // that 400s on a parent who did as they were told.
            expect(saved(User)).toHaveLength(1);
            expect(saved(Profile)).toHaveLength(1);
            expect(confirmations.issueFor).toHaveBeenCalledWith(expect.anything(), 'ana@example.com', expect.any(Date), manager);
            for (const call of outbox.queue.mock.calls) {
                expect(call[1]).toBe(manager);
            }
        });

        it('mails the parent a link carrying the issued token', async () => {
            registrationSucceeds();
            confirmations.issueFor.mockResolvedValue({ token: 'tok-abc', expiresAt: new Date() });

            await service.register(REGISTRATION);

            const toParent = outbox.queue.mock.calls.find((call) => (call[0] as { to: string }).to === 'ana@example.com');
            expect(toParent).toBeDefined();
            expect((toParent?.[0] as { bodyText: string }).bodyText).toContain('tok-abc');
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

            const result = await service.register(REGISTRATION);

            const access = jwtService.verify(result.accessToken, { secret: jwtConstants.accessTokenSecret });
            expect(access).toMatchObject({ sub: 7, username: 'ana', role: 'PARENT' });

            const refresh = jwtService.verify(result.refreshToken, { secret: jwtConstants.refreshTokenSecret });
            expect(refresh).toMatchObject({ sub: 7 });
        });

        it('does not put the role in the refresh token', async () => {
            registrationSucceeds();

            const { refreshToken } = await service.register(REGISTRATION);
            const payload = jwtService.verify<Record<string, unknown>>(refreshToken, {
                secret: jwtConstants.refreshTokenSecret,
            });

            expect(payload.role).toBeUndefined();
            expect(payload.username).toBeUndefined();
        });
    });

    describe('resendConfirmation', () => {
        it('sends to the address on file, never to one supplied by the caller', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 7, emailConfirmedAt: null });
            profileRepo.findOne!.mockResolvedValue({ id: 4, firstName: 'Ana', email: 'ana@example.com' });

            await service.resendConfirmation(7);

            // The method takes no address for exactly this reason: one that did would let anyone
            // holding a session point a confirmation at a mailbox of their choosing.
            expect(confirmations.issueFor).toHaveBeenCalledWith(expect.anything(), 'ana@example.com', expect.any(Date), manager);
            expect((outbox.queue.mock.calls[0][0] as { to: string }).to).toBe('ana@example.com');
        });

        it('refuses when the address is already confirmed', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 7, emailConfirmedAt: new Date() });

            await expect(service.resendConfirmation(7)).rejects.toMatchObject({
                response: { error: 'EMAIL_ALREADY_CONFIRMED' },
            });
            expect(outbox.queue).not.toHaveBeenCalled();
        });
    });

    describe('login', () => {
        const withUser = async (password: string) => {
            const passwordHash = await bcrypt.hash(password, 10);
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', passwordHash, role: 'PARENT' });
        };

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
    });
});
