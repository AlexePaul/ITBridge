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
            confirmEmail: jest.fn().mockResolvedValue({ emailConfirmed: true, active: false }),
            resendConfirmation: jest.fn().mockResolvedValue({ message: 'Am retrimis linkul de confirmare' }),
        });

    /** Every field `RegisterDto` requires since E11/S2. */
    const registration = {
        username: 'ana',
        password: 'secret',
        firstName: 'Ana',
        lastName: 'Popescu',
        email: 'ana@example.com',
        phone: '0712345678',
        address: 'Str. Exemplu 12',
        emergencyContactName: 'Maria Popescu',
        emergencyContactRelation: 'bunica',
        emergencyContactPhone: '0723456789',
    };

    it('passes credentials to the service without touching them', async () => {
        const { controller, service } = await build();
        const dto = { username: 'ana', password: 'secret' };
        await controller.login(dto, 'jest');
        expect(service.login).toHaveBeenCalledWith(dto, 'jest');
    });

    it('register delegates to the service', async () => {
        const { controller, service } = await build();
        await controller.register(registration, 'jest');
        expect(service.register).toHaveBeenCalledWith(registration, 'jest');
    });

    it('confirm-email passes the token through, and nothing else', async () => {
        const { controller, service } = await build();
        await controller.confirmEmail({ token: 'tok-abc' });
        expect(service.confirmEmail).toHaveBeenCalledWith('tok-abc');
    });

    it('resend-confirmation identifies the user from the token, not from the body', async () => {
        const { controller, service } = await build();
        await controller.resendConfirmation(requestOf(Role.PARENT, 42));
        expect(service.resendConfirmation).toHaveBeenCalledWith(42);
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
