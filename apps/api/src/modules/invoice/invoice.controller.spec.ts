import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { buildController, requestOf } from 'src/testing/controller.spec-helpers';
import { ArrearsService } from './arrears.service';
import { Role } from 'src/enum/role.enum';
import { FiscalIssuingService } from './fiscal-issuing.service';
import { FiscalDivergenceService } from './fiscal-divergence.service';

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
                { provide: FiscalDivergenceService, useValue: divergence },
            ],
        );

    /** E16/S7's service — the controller only forwards to it, and hands it the invoices it lists to attach what is left to pay. */
    const arrears = {
        list: jest.fn().mockResolvedValue([]),
        withBalances: jest.fn((invoices: { id: number }[]) => Promise.resolve(invoices.map((invoice) => ({ ...invoice, paid: 0, outstanding: 0 })))),
    };

    /** E16/S2's queue, likewise: status, retry and confirm are forwarded as they come. */
    const fiscal = { status: jest.fn(), retry: jest.fn(), confirmIssued: jest.fn() };

    /** E16/S8's divergence check: the report and "check now", forwarded as they come. */
    const divergence = { report: jest.fn(), markAllDue: jest.fn() };

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

    it('forwards the divergence report and the request to check again', async () => {
        const { controller } = await build();

        await controller.fiscalDivergences();
        await controller.refreshFiscalDivergences();

        expect(divergence.report).toHaveBeenCalledWith();
        expect(divergence.markAllDue).toHaveBeenCalledWith();
    });
});
