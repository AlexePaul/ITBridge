import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('AuthController', () => {
    const build = () =>
        buildController(AuthController, AuthService, {
            register: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
            login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
            refreshToken: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r2' }),
            getUserProfile: jest.fn().mockResolvedValue({ id: 42 }),
            logout: jest.fn().mockResolvedValue({ message: 'Logged out' }),
            logoutEverywhere: jest.fn().mockResolvedValue({ message: 'All sessions ended' }),
            listSessions: jest.fn().mockResolvedValue([]),
        });

    it('passes credentials to the service without touching them', async () => {
        const { controller, service } = await build();
        const dto = { username: 'ana', password: 'secret' };
        await controller.login(dto, 'jest');
        expect(service.login).toHaveBeenCalledWith(dto, 'jest');
    });

    it('register delegates to the service', async () => {
        const { controller, service } = await build();
        const dto = { username: 'ana', password: 'secret' };
        await controller.register(dto, 'jest');
        expect(service.register).toHaveBeenCalledWith(dto, 'jest');
    });

    it('refresh delegates to the service', async () => {
        const { controller, service } = await build();
        await controller.refresh({ refreshToken: 'r' }, 'jest');
        expect(service.refreshToken).toHaveBeenCalledWith({ refreshToken: 'r' }, 'jest');
    });

    it('logout hands the refresh token to the service, and needs no access token', async () => {
        const { controller, service } = await build();
        await controller.logout({ refreshToken: 'r' });
        expect(service.logout).toHaveBeenCalledWith('r');
    });

    it("logout-all revokes only the caller's own sessions", async () => {
        const { controller, service } = await build();
        await controller.logoutEverywhere(requestOf(Role.PARENT, 42));
        expect(service.logoutEverywhere).toHaveBeenCalledWith(42);
    });

    it("sessions lists only the caller's own", async () => {
        const { controller, service } = await build();
        await controller.sessions(requestOf(Role.PARENT, 42));
        expect(service.listSessions).toHaveBeenCalledWith(42);
    });

    it('/me reads identity from the token, not from the request', async () => {
        const { controller, service } = await build();
        await controller.getProfile(requestOf(Role.PARENT, 42));
        expect(service.getUserProfile).toHaveBeenCalledWith(42);
    });
});
