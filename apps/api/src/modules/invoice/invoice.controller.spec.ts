import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { Role } from 'src/enum/role.enum';

describe('InvoiceController', () => {
    const build = () =>
        buildController(InvoiceController, InvoiceService, {
            createInvoice: jest.fn().mockResolvedValue([]),
            findInvoices: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ id: 1 }),
            updateInvoice: jest.fn().mockResolvedValue({ id: 1 }),
            deleteInvoice: jest.fn().mockResolvedValue(undefined),
            getInvoicePdf: jest.fn().mockResolvedValue(undefined),
            getPreview: jest.fn().mockResolvedValue([]),
        });

    it('passes the role and user id from the token to findInvoices', async () => {
        const { controller, service } = await build();

        await controller.findInvoices({}, requestOf(Role.PARENT, 42));

        expect(service.findInvoices).toHaveBeenCalledWith({}, Role.PARENT, 42);
    });

    it('passes the role and user id to findOne', async () => {
        const { controller, service } = await build();

        await controller.findOne(7, requestOf(Role.PARENT, 42));

        expect(service.findOne).toHaveBeenCalledWith(7, Role.PARENT, 42);
    });

    it('takes identity only from the token, never from body or query', async () => {
        // If a controller accepted a userId from the request, service authorization could be bypassed.
        const { controller, service } = await build();

        await controller.findInvoices({ parentId: 999 }, requestOf(Role.PARENT, 42));

        expect(service.findInvoices).toHaveBeenCalledWith({ parentId: 999 }, Role.PARENT, 42);
    });

    it('deleteInvoice returns no content', async () => {
        const { controller } = await build();
        await expect(controller.remove(1)).resolves.toBeUndefined();
    });
});
