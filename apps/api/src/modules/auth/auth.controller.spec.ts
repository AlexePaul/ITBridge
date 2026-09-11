import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('AuthController', () => {
    /** The second service the controller takes, shared by the three password routes. */
    let passwordResets: { request: jest.Mock; reset: jest.Mock; change: jest.Mock };

    beforeEach(() => {
        passwordResets = {
            request: jest.fn().mockResolvedValue(undefined),
            reset: jest.fn().mockResolvedValue(undefined),
            change: jest.fn().mockResolvedValue(undefined),
        };
    });

    const build = () =>
        buildController(
            AuthController,
            AuthService,
            {
                register: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
                login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
                refreshToken: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r2' }),
                getUserProfile: jest.fn().mockResolvedValue({ id: 42 }),
                logout: jest.fn().mockResolvedValue({ message: 'Logged out' }),
                logoutEverywhere: jest.fn().mockResolvedValue({ message: 'All sessions ended' }),
                listSessions: jest.fn().mockResolvedValue([]),
                confirmEmail: jest.fn().mockResolvedValue({ emailConfirmed: true, active: false }),
                resendConfirmation: jest.fn().mockResolvedValue({ message: 'Am retrimis linkul de confirmare' }),
            },
            [{ provide: PasswordResetService, useValue: passwordResets }],
        );

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
        acceptedTerms: true,
        acceptedUnusualClauses: true,
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
    describe('the password routes', () => {
        it('forgot-password answers the same sentence whatever the service found', async () => {
            const { controller } = await build();

            const found = await controller.forgotPassword({ email: 'ana@example.com' });
            passwordResets.request.mockResolvedValueOnce(undefined);
            const notFound = await controller.forgotPassword({ email: 'nimeni@example.com' });

            // The controller cannot tell them apart, because the service does not say. That is what
            // keeps the form from answering "is this address a family at this school".
            expect(found).toEqual(notFound);
            expect(passwordResets.request).toHaveBeenCalledWith('ana@example.com');
        });

        it('reset-password passes the token and the new password, and nothing else', async () => {
            const { controller } = await build();

            await controller.resetPassword({ token: 'tok', password: 'parola-noua' });

            expect(passwordResets.reset).toHaveBeenCalledWith('tok', 'parola-noua');
        });

        it('change-password identifies the account from the token, never from the body', async () => {
            const { controller } = await build();

            await controller.changePassword(requestOf(Role.PARENT, 42), {
                currentPassword: 'veche',
                newPassword: 'noua',
            });

            expect(passwordResets.change).toHaveBeenCalledWith(42, 'veche', 'noua');
        });
    });
});
