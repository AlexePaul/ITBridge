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

    const cases: [string, (c: ChildController) => Promise<unknown>][] = [
        ['createChild', (c) => c.createChild({ parentId: 1 } as never, requestOf(Role.PARENT, 42))],
        ['findChildren', (c) => c.findChildren({}, requestOf(Role.PARENT, 42))],
        ['updateChild', (c) => c.updateChild(7, {}, requestOf(Role.PARENT, 42))],
        ['deleteChild', (c) => c.deleteChild(7, requestOf(Role.PARENT, 42))],
    ];

    it.each(cases)('%s primește rolul și userId-ul din token, ca ultimi doi parametri', async (method, call) => {
        const { controller, service } = await build();

        await call(controller);

        const mock = service[method as keyof typeof service] as jest.Mock;
        expect(mock.mock.calls[0].slice(-2)).toEqual([Role.PARENT, 42]);
    });

    it('un PARENT nu poate cere copiii altui părinte prin filtru — identitatea vine tot din token', async () => {
        const { controller, service } = await build();

        await controller.findChildren({ parentId: 999 }, requestOf(Role.PARENT, 42));

        expect((service.findChildren as jest.Mock).mock.calls[0].slice(-2)).toEqual([Role.PARENT, 42]);
    });
});
