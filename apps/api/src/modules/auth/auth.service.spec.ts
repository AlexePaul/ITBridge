import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from 'src/entities/user.entity';
import { jwtConstants } from 'src/constants/jwtConstants';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { SessionService } from './session.service';

describe('AuthService', () => {
    let service: AuthService;
    let jwtService: JwtService;
    let userRepo: MockRepository;
    let sessions: Record<string, jest.Mock>;

    beforeEach(async () => {
        userRepo = createMockRepository();
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
            providers: [AuthService, provideMockRepository(User, userRepo), { provide: SessionService, useValue: sessions }],
        }).compile();

        service = module.get(AuthService);
        jwtService = module.get(JwtService);
    });

    describe('register', () => {
        it('stores the password as a bcrypt hash, never in clear text', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            userRepo.create!.mockImplementation((data: Partial<User>) => ({ id: 1, ...data }));
            userRepo.save!.mockImplementation((u: User) => Promise.resolve(u));

            await service.register({ username: 'ana', password: 'parola-secreta' });

            const created = userRepo.create!.mock.calls[0][0] as { passwordHash: string };
            expect(created.passwordHash).not.toBe('parola-secreta');
            expect(created.passwordHash).toMatch(/^\$2[aby]\$/);
            await expect(bcrypt.compare('parola-secreta', created.passwordHash)).resolves.toBe(true);
        });

        it('always creates a PARENT, even when the request asks for something else', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            userRepo.create!.mockImplementation((data: Partial<User>) => ({ id: 1, ...data }));
            userRepo.save!.mockImplementation((u: User) => Promise.resolve(u));

            await service.register({ username: 'ana', password: 'x', role: 'ADMIN' } as never);

            expect(userRepo.create!.mock.calls[0][0]).toMatchObject({ role: 'PARENT' });
        });

        it('rejects a username that is already taken', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 1, username: 'ana' });

            await expect(service.register({ username: 'ana', password: 'x' })).rejects.toThrow(ConflictException);
            expect(userRepo.save).not.toHaveBeenCalled();
        });

        it('returns a valid pair of tokens', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            userRepo.create!.mockImplementation((data: Partial<User>) => ({ id: 7, ...data }));
            userRepo.save!.mockImplementation((u: User) => Promise.resolve(u));

            const result = await service.register({ username: 'ana', password: 'x' });

            const access = jwtService.verify(result.accessToken, { secret: jwtConstants.accessTokenSecret });
            expect(access).toMatchObject({ sub: 7, username: 'ana', role: 'PARENT' });

            const refresh = jwtService.verify(result.refreshToken, { secret: jwtConstants.refreshTokenSecret });
            expect(refresh).toMatchObject({ sub: 7 });
        });

        it('does not put the role in the refresh token', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            userRepo.create!.mockImplementation((data: Partial<User>) => ({ id: 7, ...data }));
            userRepo.save!.mockImplementation((u: User) => Promise.resolve(u));

            const { refreshToken } = await service.register({ username: 'ana', password: 'x' });
            const payload = jwtService.verify<Record<string, unknown>>(refreshToken, {
                secret: jwtConstants.refreshTokenSecret,
            });

            expect(payload.role).toBeUndefined();
            expect(payload.username).toBeUndefined();
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
