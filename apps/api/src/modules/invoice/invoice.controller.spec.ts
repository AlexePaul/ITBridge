import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { ArrearsService } from './arrears.service';
import { Role } from 'src/enum/role.enum';
import { FiscalIssuingService } from './fiscal-issuing.service';

describe('InvoiceController', () => {
    const build = () =>
        buildController(
            InvoiceController,
            InvoiceService,
            {
                createInvoice: jest.fn().mockResolvedValue([]),
                findInvoices: jest.fn().mockResolvedValue([]),
                findOne: jest.fn().mockResolvedValue({ id: 1 }),
                updateInvoice: jest.fn().mockResolvedValue({ id: 1 }),
                deleteInvoice: jest.fn().mockResolvedValue(undefined),
                getInvoicePdf: jest.fn().mockResolvedValue(undefined),
                getPreview: jest.fn().mockResolvedValue([]),
            },
            [
                { provide: ArrearsService, useValue: arrears },
                { provide: FiscalIssuingService, useValue: fiscal },
            ],
        );

    /** E16/S7's service — the controller only forwards to it. */
    const arrears = { list: jest.fn().mockResolvedValue([]) };

    /** E16/S2's queue, likewise: status, retry and confirm are forwarded as they come. */
    const fiscal = { status: jest.fn(), retry: jest.fn(), confirmIssued: jest.fn() };

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
        await expect(controller.remove(1, requestOf(Role.ADMIN, 1))).resolves.toBeUndefined();
    });

    it('the arrears list takes no input at all — it is the same question for every admin', async () => {
        const { controller } = await build();
        await controller.arrears();
        expect(arrears.list).toHaveBeenCalledWith();
    });

    it('forwards a retry and a confirmation with the actor from the token', async () => {
        const { controller } = await build();

        await controller.retryFiscal(7, requestOf(Role.ADMIN, 42));
        await controller.confirmFiscal(7, { number: '0041' }, requestOf(Role.ADMIN, 42));

        expect(fiscal.retry).toHaveBeenCalledWith(7, expect.objectContaining({ userId: 42 }));
        expect(fiscal.confirmIssued).toHaveBeenCalledWith(7, '0041', expect.objectContaining({ userId: 42 }));
    });
});
