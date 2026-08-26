import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('AuthController', () => {
    const build = () =>
        buildController(AuthController, AuthService, {
            register: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
            login: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
            refreshToken: jest.fn().mockResolvedValue({ accessToken: 'a' }),
            getUserProfile: jest.fn().mockResolvedValue({ id: 42 }),
        });

    it('trece credențialele către service, fără să le atingă', async () => {
        const { controller, service } = await build();
        const dto = { username: 'ana', password: 'secret' };
        await controller.login(dto);
        expect(service.login).toHaveBeenCalledWith(dto);
    });

    it('register deleagă către service', async () => {
        const { controller, service } = await build();
        const dto = { username: 'ana', password: 'secret' };
        await controller.register(dto);
        expect(service.register).toHaveBeenCalledWith(dto);
    });

    it('refresh deleagă către service', async () => {
        const { controller, service } = await build();
        await controller.refresh({ refreshToken: 'r' });
        expect(service.refreshToken).toHaveBeenCalledWith({ refreshToken: 'r' });
    });

    it('/me citește identitatea din token, nu din cerere', async () => {
        const { controller, service } = await build();
        await controller.getProfile(requestOf(Role.PARENT, 42));
        expect(service.getUserProfile).toHaveBeenCalledWith(42);
    });
});
