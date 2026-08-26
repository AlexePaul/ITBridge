import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from 'src/entities/user.entity';
import { jwtConstants } from 'src/constants/jwtConstants';
import { createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('AuthService', () => {
    let service: AuthService;
    let jwtService: JwtService;
    let userRepo: MockRepository;

    beforeEach(async () => {
        userRepo = createMockRepository();

        // JwtService real, nu mock: tokenurile emise trebuie să fie verificabile, iar testul de
        // expirare nu are sens pe un mock.
        const module: TestingModule = await Test.createTestingModule({
            imports: [JwtModule.register({})],
            providers: [AuthService, provideMockRepository(User, userRepo)],
        }).compile();

        service = module.get(AuthService);
        jwtService = module.get(JwtService);
    });

    describe('register', () => {
        it('stochează parola ca hash bcrypt, niciodată în clar', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            userRepo.create!.mockImplementation((data: Partial<User>) => ({ id: 1, ...data }));
            userRepo.save!.mockImplementation((u: User) => Promise.resolve(u));

            await service.register({ username: 'ana', password: 'parola-secreta' });

            const created = userRepo.create!.mock.calls[0][0] as { passwordHash: string };
            expect(created.passwordHash).not.toBe('parola-secreta');
            expect(created.passwordHash).toMatch(/^\$2[aby]\$/);
            await expect(bcrypt.compare('parola-secreta', created.passwordHash)).resolves.toBe(true);
        });

        it('creează întotdeauna PARENT, chiar dacă cererea ar cere altceva', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            userRepo.create!.mockImplementation((data: Partial<User>) => ({ id: 1, ...data }));
            userRepo.save!.mockImplementation((u: User) => Promise.resolve(u));

            await service.register({ username: 'ana', password: 'x', role: 'ADMIN' } as never);

            expect(userRepo.create!.mock.calls[0][0]).toMatchObject({ role: 'PARENT' });
        });

        it('respinge un username deja folosit', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 1, username: 'ana' });

            await expect(service.register({ username: 'ana', password: 'x' })).rejects.toThrow(ConflictException);
            expect(userRepo.save).not.toHaveBeenCalled();
        });

        it('întoarce o pereche de tokenuri valide', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            userRepo.create!.mockImplementation((data: Partial<User>) => ({ id: 7, ...data }));
            userRepo.save!.mockImplementation((u: User) => Promise.resolve(u));

            const result = await service.register({ username: 'ana', password: 'x' });

            const access = jwtService.verify(result.accessToken, { secret: jwtConstants.accessTokenSecret });
            expect(access).toMatchObject({ sub: 7, username: 'ana', role: 'PARENT' });

            const refresh = jwtService.verify(result.refreshToken, { secret: jwtConstants.refreshTokenSecret });
            expect(refresh).toMatchObject({ sub: 7 });
        });

        it('nu pune rolul în refresh token', async () => {
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

        it('acceptă parola corectă', async () => {
            await withUser('corecta');
            await expect(service.login({ username: 'ana', password: 'corecta' })).resolves.toMatchObject({
                message: 'Login successful',
            });
        });

        it('respinge parola greșită', async () => {
            await withUser('corecta');
            await expect(service.login({ username: 'ana', password: 'gresita' })).rejects.toThrow(UnauthorizedException);
        });

        it('respinge un utilizator inexistent', async () => {
            userRepo.findOne!.mockResolvedValue(null);
            await expect(service.login({ username: 'nimeni', password: 'x' })).rejects.toThrow(UnauthorizedException);
        });

        it('nu deosebeşte utilizator inexistent de parolă greșită', async () => {
            // Mesaje diferite ar permite enumerarea conturilor.
            userRepo.findOne!.mockResolvedValue(null);
            const absent = await service.login({ username: 'nimeni', password: 'x' }).catch((e: Error) => e.message);

            await withUser('corecta');
            const wrong = await service.login({ username: 'ana', password: 'gresita' }).catch((e: Error) => e.message);

            expect(absent).toBe(wrong);
        });
    });

    describe('refreshToken', () => {
        it('emite un access token nou, cu rolul curent din baza de date', async () => {
            const refreshToken = jwtService.sign({ sub: 3 }, { secret: jwtConstants.refreshTokenSecret });
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', role: 'ADMIN' });

            const { accessToken } = await service.refreshToken({ refreshToken });

            expect(jwtService.verify(accessToken, { secret: jwtConstants.accessTokenSecret })).toMatchObject({
                sub: 3,
                role: 'ADMIN',
            });
        });

        it('respinge un token semnat cu alt secret', async () => {
            const foreign = jwtService.sign({ sub: 3 }, { secret: 'alt-secret' });
            await expect(service.refreshToken({ refreshToken: foreign })).rejects.toThrow(UnauthorizedException);
        });

        it('respinge un access token folosit ca refresh token', async () => {
            const access = jwtService.sign({ sub: 3, role: 'ADMIN' }, { secret: jwtConstants.accessTokenSecret });
            await expect(service.refreshToken({ refreshToken: access })).rejects.toThrow(UnauthorizedException);
        });

        it('respinge un token expirat', async () => {
            const expired = jwtService.sign({ sub: 3 }, { secret: jwtConstants.refreshTokenSecret, expiresIn: '-1s' });
            await expect(service.refreshToken({ refreshToken: expired })).rejects.toThrow(UnauthorizedException);
        });

        it('respinge un token valid al cărui utilizator a fost șters', async () => {
            const refreshToken = jwtService.sign({ sub: 3 }, { secret: jwtConstants.refreshTokenSecret });
            userRepo.findOne!.mockResolvedValue(null);

            await expect(service.refreshToken({ refreshToken })).rejects.toThrow(UnauthorizedException);
        });

        it('respinge gunoi', async () => {
            await expect(service.refreshToken({ refreshToken: 'nu-e-un-jwt' })).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('getUserProfile', () => {
        it('nu selectează niciodată passwordHash', async () => {
            userRepo.findOne!.mockResolvedValue({ id: 3, username: 'ana', role: 'PARENT' });

            await service.getUserProfile(3);

            const select = (userRepo.findOne!.mock.calls[0][0] as { select: string[] }).select;
            expect(select).not.toContain('passwordHash');
        });
    });
});
