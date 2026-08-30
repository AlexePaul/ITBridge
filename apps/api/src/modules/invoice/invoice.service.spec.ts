import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { PdfService } from './pdf.service';
import { S3Service } from 'src/modules/storage/s3.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Discount } from 'src/entities/discount.entity';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, isScopedToUser, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('InvoiceService', () => {
    let service: InvoiceService;
    let invoiceRepo: MockRepository;
    let profileRepo: MockRepository;
    let discountRepo: MockRepository;
    let s3: { putObject: jest.Mock; downloadFile: jest.Mock };
    let transactionManager: { save: jest.Mock };

    /** A profile with `n` children, enough to get past the checks in `calculateAmount`. */
    const profileWithChildren = (n: number, id = 1) => ({
        id,
        firstName: 'Ana',
        lastName: 'Pop',
        children: Array.from({ length: n }, (_, i) => ({ id: i + 1 })),
    });

    beforeEach(async () => {
        invoiceRepo = createMockRepository();
        profileRepo = createMockRepository();
        discountRepo = createMockRepository();
        s3 = { putObject: jest.fn(), downloadFile: jest.fn() };

        // `createInvoice` writes the row and uploads the PDF inside one transaction. The fake runs
        // the callback with a manager whose `save` behaves like the repository's, so a rejected
        // upload propagates exactly as it would in production.
        transactionManager = { save: jest.fn() };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                InvoiceService,
                provideMockRepository(Invoice, invoiceRepo),
                provideMockRepository(Profile, profileRepo),
                provideMockRepository(Discount, discountRepo),
                { provide: PdfService, useValue: { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('')) } },
                { provide: S3Service, useValue: s3 },
                {
                    provide: DataSource,
                    useValue: {
                        transaction: jest.fn((cb: (m: EntityManager) => Promise<unknown>) => cb(transactionManager as unknown as EntityManager)),
                    },
                },
            ],
        }).compile();

        service = module.get(InvoiceService);
    });

    describe('calculateAmount', () => {
        beforeEach(() => {
            discountRepo.find!.mockResolvedValue([]);
        });

        it('filters discounts by parent and month', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1, 7));
            await service.calculateAmount(7, '2026-03');
            expect(discountRepo.find).toHaveBeenCalledWith({
                where: { parent: { id: 7 }, monthIssued: '2026-03' },
            });
        });

        it('rejects a parent that does not exist', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            await expect(service.calculateAmount(99, '2026-03')).rejects.toThrow(NotFoundException);
        });

        it('rejects a parent with no children', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(0));
            await expect(service.calculateAmount(1, '2026-03')).rejects.toThrow(NotFoundException);
        });

        // These three were `it.failing` for as long as the bug lived: two children were charged
        // 500 instead of 600, and three or more had no branch at all, so the total stayed 0 and a
        // discount then took it negative. They are ordinary regression tests now.

        it('charges 350 for one child', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(350);
        });

        // 350 for the first child plus 250 for the sibling. It used to compute 250 x 2, which is
        // the number the public site has never shown.
        it('charges 600 for two children, not 500', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(2));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(600);
        });

        it('charges 850 for three children, and keeps going for four', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(3));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(850);

            profileRepo.findOne!.mockResolvedValue(profileWithChildren(4));
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(1100);
        });

        it('subtracts the discounts for that month', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1));
            discountRepo.find!.mockResolvedValue([{ value: 50 }, { value: 25 }]);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(275);
        });

        // A discount larger than the invoice is a typo, not a credit note. Nothing downstream
        // expects a negative invoice, and the school has never meant to issue one.
        it('never returns a negative amount, however large the discount', async () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1));
            discountRepo.find!.mockResolvedValue([{ value: 5000 }]);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(0);
        });
    });

    describe('row-level authorization', () => {
        it('findInvoices narrows nothing for an ADMIN', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findInvoices({}, Role.ADMIN, 42);

            expect(isScopedToUser(qb, 42)).toBe(false);
        });

        it('findInvoices narrows to the authenticated user for a PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findInvoices({}, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne narrows to the authenticated user for a PARENT', async () => {
            const qb = createMockQueryBuilder({ one: { id: 1 } });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findOne(1, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne throws NotFound when the invoice belongs to another parent', async () => {
            // The narrowed query finds nothing — the parent never learns the invoice exists.
            const qb = createMockQueryBuilder({ one: null });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await expect(service.findOne(1, Role.PARENT, 42)).rejects.toThrow(NotFoundException);
        });

        it('getInvoicePdf goes through findOne, so it inherits the narrowing', async () => {
            const qb = createMockQueryBuilder({ one: null });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);

            await expect(service.getInvoicePdf(1, Role.PARENT, 42)).rejects.toThrow(NotFoundException);
        });
    });

    describe('createInvoice', () => {
        const setUpHappyPath = () => {
            profileRepo.findOne!.mockResolvedValue(profileWithChildren(1, 10));
            discountRepo.find!.mockResolvedValue([]);
            transactionManager.save.mockImplementation((inv: { id?: number }) => Promise.resolve({ ...inv, id: 55 }));
        };

        it('issues one invoice per parent, with the calculated amount', async () => {
            setUpHappyPath();

            const created = await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' });

            expect(created).toHaveLength(1);
            expect(transactionManager.save).toHaveBeenCalledWith(
                expect.objectContaining({ amount: 350, monthIssued: '2026-03', status: InvoiceStatus.PENDING }),
            );
        });

        it('issues the invoice as PENDING, not as paid', async () => {
            setUpHappyPath();

            await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' });

            expect((transactionManager.save.mock.calls[0][0] as { status: InvoiceStatus }).status).toBe(InvoiceStatus.PENDING);
        });

        it('uploads a PDF to S3 under a predictable path, keyed by billing month', async () => {
            setUpHappyPath();

            await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' });

            // The type is now an argument rather than a constant inside the client, so the assertion
            // covers it: an invoice stored as anything other than a PDF would be served back wrong.
            expect(s3.putObject).toHaveBeenCalledWith({
                key: expect.stringMatching(/^invoices\/2026-03\/.*\.pdf$/),
                body: expect.any(Buffer),
                contentType: 'application/pdf',
            });
        });

        it('processes several parents in a single request', async () => {
            setUpHappyPath();

            const created = await service.createInvoice({
                parentIds: [10, 11],
                monthIssued: '2026-03',
                dateIssued: '2026-03-01',
            });

            expect(created).toHaveLength(2);
        });

        it('rejects a non-existent parent before saving anything', async () => {
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(service.createInvoice({ parentIds: [99], monthIssued: '2026-03', dateIssued: '2026-03-01' })).rejects.toThrow(NotFoundException);

            expect(invoiceRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('updateInvoice', () => {
        it('changes only the fields that were sent', async () => {
            const invoice = { id: 1, amount: 350, status: InvoiceStatus.PENDING, dateIssued: new Date('2026-03-01') };
            invoiceRepo.findOne!.mockResolvedValue(invoice);
            invoiceRepo.save!.mockImplementation((i: unknown) => Promise.resolve(i));

            await service.updateInvoice(1, { status: InvoiceStatus.PAID });

            expect(invoice.status).toBe(InvoiceStatus.PAID);
            expect(invoice.amount).toBe(350);
        });

        it('rejects an invoice that does not exist', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateInvoice(99, { amount: 1 })).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteInvoice', () => {
        it('deletes an existing invoice', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 1 });

            await service.deleteInvoice(1);

            expect(invoiceRepo.delete).toHaveBeenCalledWith(1);
        });

        it('rejects a non-existent invoice without deleting anything', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);

            await expect(service.deleteInvoice(99)).rejects.toThrow(NotFoundException);
            expect(invoiceRepo.delete).not.toHaveBeenCalled();
        });
    });

    describe('getPreview', () => {
        it('reports parents whose calculation fails instead of failing the whole request', async () => {
            profileRepo.findOne!.mockImplementation(({ where }: { where: { id: number } }) =>
                Promise.resolve(where.id === 1 ? profileWithChildren(1, 1) : null),
            );
            discountRepo.find!.mockResolvedValue([]);

            // The failing parent is reported rather than dropped: an admin previewing ten parents
            // used to get seven rows back with nothing to say the other three had failed.
            await expect(service.getPreview({ parentIds: [1, 99], monthIssued: '2026-03' })).resolves.toEqual([
                { parentId: 1, amount: 350, error: null },
                { parentId: 99, amount: null, error: 'Parent profile not found' },
            ]);
        });
    });
});
