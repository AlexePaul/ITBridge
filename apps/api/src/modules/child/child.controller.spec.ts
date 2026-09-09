import { ChildController } from './child.controller';
import { ChildService } from './child.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('ChildController', () => {
    const build = () =>
        buildController(ChildController, ChildService, {
            createChild: jest.fn().mockResolvedValue({ id: 1 }),
            findChildren: jest.fn().mockResolvedValue([]),
            updateChild: jest.fn().mockResolvedValue({ id: 1 }),
            deleteChild: jest.fn().mockResolvedValue({ message: 'ok' }),
            assignChildToGroup: jest.fn().mockResolvedValue({ id: 1 }),
            removeChildFromGroup: jest.fn().mockResolvedValue({ id: 1 }),
        });

    /**
     * `carriesActor` marks the handlers that also hand the service an actor (E07/S3), so the
     * identity check has to look one position further back. Written per case rather than as a
     * blanket `slice(-3)`: the point of this test is *which* position each value occupies, and a
     * slice wide enough for every signature would stop checking that.
     */
    const cases: [string, (c: ChildController) => Promise<unknown>, boolean][] = [
        ['createChild', (c) => c.createChild({ parentId: 1 } as never, requestOf(Role.PARENT, 42, 'ana')), true],
        ['findChildren', (c) => c.findChildren({}, requestOf(Role.PARENT, 42, 'ana')), false],
        ['updateChild', (c) => c.updateChild(7, {}, requestOf(Role.PARENT, 42, 'ana')), true],
        ['deleteChild', (c) => c.deleteChild(7, requestOf(Role.PARENT, 42, 'ana')), true],
    ];

    it.each(cases)('%s receives the role and user id from the token', async (method, call, carriesActor) => {
        const { controller, service } = await build();

        await call(controller);

        const mock = service[method as keyof typeof service] as jest.Mock;
        const args = mock.mock.calls[0];

        expect(carriesActor ? args.slice(-3, -1) : args.slice(-2)).toEqual([Role.PARENT, 42]);
        // And the actor beside them comes from the same token, not from anything a caller can set.
        if (carriesActor) expect(args.at(-1)).toEqual({ userId: 42, username: 'ana' });
    });

    it("a PARENT cannot request another parent's children through a filter - identity still comes from the token", async () => {
        const { controller, service } = await build();

        await controller.findChildren({ parentId: 999 }, requestOf(Role.PARENT, 42));

        expect((service.findChildren as jest.Mock).mock.calls[0].slice(-2)).toEqual([Role.PARENT, 42]);
    });
});
