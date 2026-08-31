import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { PdfService } from './pdf.service';
import { S3Service } from './s3.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Discount } from 'src/entities/discount.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, isScopedToUser, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('InvoiceService', () => {
    let service: InvoiceService;
    let invoiceRepo: MockRepository;
    let profileRepo: MockRepository;
    let discountRepo: MockRepository;
    let enrollmentRepo: MockRepository;
    let s3: { uploadFile: jest.Mock; downloadFile: jest.Mock };
    let transactionManager: { save: jest.Mock };

    const aProfile = (id = 1) => ({ id, firstName: 'Ana', lastName: 'Pop' });

    /**
     * How many of this family's children are actively enrolled — which is what the amount counts
     * since E11/S4. A trial is free, and a child in no group is not attending.
     */
    const withEnrolledChildren = (n: number) => {
        enrollmentRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ count: n }));
    };

    beforeEach(async () => {
        invoiceRepo = createMockRepository();
        profileRepo = createMockRepository();
        discountRepo = createMockRepository();
        enrollmentRepo = createMockRepository();
        s3 = { uploadFile: jest.fn(), downloadFile: jest.fn() };

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
                provideMockRepository(Enrollment, enrollmentRepo),
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
            profileRepo.findOne!.mockResolvedValue(aProfile(7));
            withEnrolledChildren(1);
            await service.calculateAmount(7, '2026-03');
            expect(discountRepo.find).toHaveBeenCalledWith({
                where: { parent: { id: 7 }, monthIssued: '2026-03' },
            });
        });

        it('rejects a parent that does not exist', async () => {
            profileRepo.findOne!.mockResolvedValue(null);
            withEnrolledChildren(1);
            await expect(service.calculateAmount(99, '2026-03')).rejects.toThrow(NotFoundException);
        });

        it('rejects a parent whose children are not enrolled anywhere', async () => {
            profileRepo.findOne!.mockResolvedValue(aProfile());
            withEnrolledChildren(0);
            await expect(service.calculateAmount(1, '2026-03')).rejects.toThrow(NotFoundException);
        });

        it('counts only ACTIVE enrolments, so a trial is not billed', async () => {
            profileRepo.findOne!.mockResolvedValue(aProfile());
            const qb = createMockQueryBuilder({ count: 1 });
            enrollmentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.calculateAmount(1, '2026-03');

            // E11/S4 says a trial does not generate an invoice. It is free; billing it would make
            // the point of offering one collapse on the first invoice.
            expect(qb.andWhereCalls.some(([, params]) => params?.status === EnrollmentStatus.ACTIVE)).toBe(true);
        });

        // These three were `it.failing` for as long as the bug lived: two children were charged
        // 500 instead of 600, and three or more had no branch at all, so the total stayed 0 and a
        // discount then took it negative. They are ordinary regression tests now.

        it('charges 350 for one child', async () => {
            profileRepo.findOne!.mockResolvedValue(aProfile());
            withEnrolledChildren(1);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(350);
        });

        // 350 for the first child plus 250 for the sibling. It used to compute 250 x 2, which is
        // the number the public site has never shown.
        it('charges 600 for two children, not 500', async () => {
            profileRepo.findOne!.mockResolvedValue(aProfile());
            withEnrolledChildren(2);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(600);
        });

        it('charges 850 for three children, and keeps going for four', async () => {
            profileRepo.findOne!.mockResolvedValue(aProfile());
            withEnrolledChildren(3);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(850);

            withEnrolledChildren(4);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(1100);
        });

        it('subtracts the discounts for that month', async () => {
            profileRepo.findOne!.mockResolvedValue(aProfile());
            withEnrolledChildren(1);
            discountRepo.find!.mockResolvedValue([{ value: 50 }, { value: 25 }]);
            await expect(service.calculateAmount(1, '2026-03')).resolves.toBe(275);
        });

        // A discount larger than the invoice is a typo, not a credit note. Nothing downstream
        // expects a negative invoice, and the school has never meant to issue one.
        it('never returns a negative amount, however large the discount', async () => {
            profileRepo.findOne!.mockResolvedValue(aProfile());
            withEnrolledChildren(1);
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
            profileRepo.findOne!.mockResolvedValue(aProfile(10));
            withEnrolledChildren(1);
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

            expect(s3.uploadFile).toHaveBeenCalledWith(expect.any(Buffer), expect.stringMatching(/^invoices\/2026-03\/.*\.pdf$/));
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

    describe('getWorksheet', () => {
        beforeEach(() => {
            invoiceRepo.find!.mockResolvedValue([]);
        });

        const withProfiles = (profiles: unknown[]) => {
            profileRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ many: profiles as never[] }));
        };

        it('returns a family with its children and their groups, and no amount', async () => {
            withProfiles([
                {
                    id: 1,
                    firstName: 'Ana',
                    lastName: 'Pop',
                    email: 'ana@example.com',
                    children: [{ id: 5, firstName: 'Maria', lastName: 'Pop', group: { id: 2, name: 'Scratch', weekday: 1 } }],
                },
            ]);

            const [row] = await service.getWorksheet('2026-10');

            // No amount on the wire: the arithmetic belongs on the screen, where somebody reads it.
            expect(row).toEqual({
                parentId: 1,
                parentName: 'Pop Ana',
                email: 'ana@example.com',
                alreadyInvoiced: false,
                children: [{ childId: 5, childName: 'Maria Pop', groupId: 2, groupName: 'Scratch', weekday: 1 }],
            });
        });

        it('leaves out a family whose children are in no group', async () => {
            withProfiles([{ id: 1, firstName: 'Ana', lastName: 'Pop', children: [{ id: 5, firstName: 'Maria', lastName: 'Pop', group: null }] }]);

            // Nothing to count and nothing to owe. A row that must be filled in with zero is worse
            // than no row.
            await expect(service.getWorksheet('2026-10')).resolves.toEqual([]);
        });

        it('marks a family that already has an invoice for the month', async () => {
            withProfiles([
                {
                    id: 1,
                    firstName: 'Ana',
                    lastName: 'Pop',
                    children: [{ id: 5, firstName: 'Maria', lastName: 'Pop', group: { id: 2, name: 'S', weekday: 1 } }],
                },
            ]);
            invoiceRepo.find!.mockResolvedValue([{ id: 9, parent: { id: 1 } }]);

            // This is what makes the screen safe to run a second time after somebody enrols on the
            // fifth: `@Unique(['parent', 'monthIssued'])` fails the whole pass otherwise.
            const [row] = await service.getWorksheet('2026-10');
            expect(row.alreadyInvoiced).toBe(true);
        });
    });

    describe('issueFromSessions', () => {
        const family = (parentId: number, sessions: number[]) => ({
            parentId,
            children: sessions.map((count, index) => ({ childId: index + 1, sessions: count })),
        });

        beforeEach(() => {
            profileRepo.findOne!.mockImplementation(({ where }: { where: { id: number } }) => Promise.resolve(aProfile(where.id)));
            invoiceRepo.findOne!.mockResolvedValue(null);
            discountRepo.find!.mockResolvedValue([]);
            transactionManager.save.mockImplementation((invoice: { amount: number }) => Promise.resolve({ ...invoice, id: 55 }));
        });

        it('bills the sessions it was given, not a figure of its own', async () => {
            const result = await service.issueFromSessions({ monthIssued: '2026-10', dateIssued: '2026-10-01', families: [family(1, [2])] });

            // The person pressing the button has looked at every number. A server that quietly
            // substituted its own would issue a different invoice from the one on screen.
            expect(result.issued[0].amount).toBe(175);
        });

        it("takes the month's discounts off", async () => {
            discountRepo.find!.mockResolvedValue([{ value: 50 }]);

            const result = await service.issueFromSessions({ monthIssued: '2026-10', dateIssued: '2026-10-01', families: [family(1, [4])] });
            expect(result.issued[0].amount).toBe(300);
        });

        it('records a month that comes to nothing, without a PDF', async () => {
            const result = await service.issueFromSessions({ monthIssued: '2026-10', dateIssued: '2026-10-01', families: [family(1, [0])] });

            // The row is the point: no invoice at all looks the same as a month nobody got round to.
            expect(result.issued).toHaveLength(0);
            expect(result.waived).toHaveLength(1);
            expect(result.waived[0].status).toBe(InvoiceStatus.WAIVED);
            expect(s3.uploadFile).not.toHaveBeenCalled();
        });

        it('skips a family already invoiced rather than failing the whole pass', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 9 });

            const result = await service.issueFromSessions({ monthIssued: '2026-10', dateIssued: '2026-10-01', families: [family(1, [4])] });

            expect(result.skipped).toEqual([{ parentId: 1, reason: 'ALREADY_INVOICED' }]);
            expect(result.issued).toHaveLength(0);
        });

        it('404s on a parent that does not exist, before writing anything', async () => {
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(service.issueFromSessions({ monthIssued: '2026-10', dateIssued: '2026-10-01', families: [family(99, [4])] })).rejects.toThrow(
                NotFoundException,
            );
            expect(transactionManager.save).not.toHaveBeenCalled();
        });
    });

    describe('getPreview', () => {
        it('reports parents whose calculation fails instead of failing the whole request', async () => {
            profileRepo.findOne!.mockImplementation(({ where }: { where: { id: number } }) => Promise.resolve(where.id === 1 ? aProfile(1) : null));
            withEnrolledChildren(1);
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
