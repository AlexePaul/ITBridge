import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('ProfileController', () => {
    const build = () =>
        buildController(ProfileController, ProfileService, {
            createProfile: jest.fn().mockResolvedValue({ id: 1 }),
            findProfiles: jest.fn().mockResolvedValue([]),
            updateProfile: jest.fn().mockResolvedValue({ id: 1 }),
            deleteProfile: jest.fn().mockResolvedValue(undefined),
        });

    /** Identity must come from the token, never from body or query. */
    const lastTwoArgs = (mock: jest.Mock) => mock.mock.calls[0].slice(-2);

    /**
     * The same rule for the handlers that also carry an actor (E07/S3): role and user id come
     * from the token, and so does the actor beside them. `lastTwoArgs` cannot serve here — the last
     * two are now the user id and the actor — and stretching it to would hide which position each
     * value is meant to occupy.
     */
    const identityAndActor = (mock: jest.Mock) => mock.mock.calls[0].slice(-3);

    it('createProfile receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.createProfile(requestOf(Role.PARENT, 42, 'ana'), { firstName: 'A', lastName: 'B' });
        expect(identityAndActor(service.createProfile as jest.Mock)).toEqual([Role.PARENT, 42, { userId: 42, username: 'ana' }]);
    });

    it('findProfiles receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.findProfiles(requestOf(Role.PARENT, 42), {});
        expect(lastTwoArgs(service.findProfiles as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('updateProfile receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.updateProfile(requestOf(Role.PARENT, 42, 'ana'), {}, 7);
        expect(identityAndActor(service.updateProfile as jest.Mock)).toEqual([Role.PARENT, 42, { userId: 42, username: 'ana' }]);
    });

    it('deleteProfile receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.deleteProfile(requestOf(Role.PARENT, 42, 'ana'), 7);
        expect(identityAndActor(service.deleteProfile as jest.Mock)).toEqual([Role.PARENT, 42, { userId: 42, username: 'ana' }]);
    });

    it("a PARENT cannot request someone else's profile through the query - identity still comes from the token", async () => {
        const { controller, service } = await build();
        await controller.findProfiles(requestOf(Role.PARENT, 42), { userId: 999 });
        expect(lastTwoArgs(service.findProfiles as jest.Mock)).toEqual([Role.PARENT, 42]);
    });
});
