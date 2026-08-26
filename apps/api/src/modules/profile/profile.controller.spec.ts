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

    /** Identitatea trebuie să vină din token, niciodată din body sau query. */
    const lastTwoArgs = (mock: jest.Mock) => mock.mock.calls[0].slice(-2);

    it('createProfile primește rolul și userId-ul din token', async () => {
        const { controller, service } = await build();
        await controller.createProfile(requestOf(Role.PARENT, 42), { firstName: 'A', lastName: 'B' });
        expect(lastTwoArgs(service.createProfile as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('findProfiles primește rolul și userId-ul din token', async () => {
        const { controller, service } = await build();
        await controller.findProfiles(requestOf(Role.PARENT, 42), {});
        expect(lastTwoArgs(service.findProfiles as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('updateProfile primește rolul și userId-ul din token', async () => {
        const { controller, service } = await build();
        await controller.updateProfile(requestOf(Role.PARENT, 42), {}, 7);
        expect(lastTwoArgs(service.updateProfile as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('deleteProfile primește rolul și userId-ul din token', async () => {
        const { controller, service } = await build();
        await controller.deleteProfile(requestOf(Role.PARENT, 42), 7);
        expect(lastTwoArgs(service.deleteProfile as jest.Mock)).toEqual([Role.PARENT, 42]);
    });

    it('un PARENT nu poate cere profilul altcuiva prin query — identitatea vine tot din token', async () => {
        const { controller, service } = await build();
        await controller.findProfiles(requestOf(Role.PARENT, 42), { userId: 999 });
        expect(lastTwoArgs(service.findProfiles as jest.Mock)).toEqual([Role.PARENT, 42]);
    });
});
