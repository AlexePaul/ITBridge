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

    it('trimite rolul și userId-ul din token către findInvoices', async () => {
        const { controller, service } = await build();

        await controller.findInvoices({}, requestOf(Role.PARENT, 42));

        expect(service.findInvoices).toHaveBeenCalledWith({}, Role.PARENT, 42);
    });

    it('trimite rolul și userId-ul către findOne', async () => {
        const { controller, service } = await build();

        await controller.findOne(7, requestOf(Role.PARENT, 42));

        expect(service.findOne).toHaveBeenCalledWith(7, Role.PARENT, 42);
    });

    it('nu ia identitatea din body sau din query, ci doar din token', async () => {
        // Dacă un controller ar accepta userId din cerere, autorizarea din service ar fi ocolibilă.
        const { controller, service } = await build();

        await controller.findInvoices({ parentId: 999 }, requestOf(Role.PARENT, 42));

        expect(service.findInvoices).toHaveBeenCalledWith({ parentId: 999 }, Role.PARENT, 42);
    });

    it('deleteInvoice nu întoarce conținut', async () => {
        const { controller } = await build();
        await expect(controller.remove(1)).resolves.toBeUndefined();
    });
});
