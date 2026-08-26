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

    it('createProfile receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.createProfile(requestOf(Role.PARENT, 42), { firstName: 'A', lastName: 'B' });
        expect(lastTwoArgs(service.createProfile as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('findProfiles receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.findProfiles(requestOf(Role.PARENT, 42), {});
        expect(lastTwoArgs(service.findProfiles as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('updateProfile receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.updateProfile(requestOf(Role.PARENT, 42), {}, 7);
        expect(lastTwoArgs(service.updateProfile as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('deleteProfile receives the role and user id from the token', async () => {
        const { controller, service } = await build();
        await controller.deleteProfile(requestOf(Role.PARENT, 42), 7);
        expect(lastTwoArgs(service.deleteProfile as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it("a PARENT cannot request someone else's profile through the query - identity still comes from the token", async () => {
        const { controller, service } = await build();
        await controller.findProfiles(requestOf(Role.PARENT, 42), { userId: 999 });
        expect(lastTwoArgs(service.findProfiles as jest.Mock)).toEqual([Role.PARENT, 42]);
    });
});
