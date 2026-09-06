import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { Child } from 'src/entities/child.entity';
import { SessionCountOverride } from 'src/entities/session-count-override.entity';
import { PdfService } from './pdf.service';
import { S3Service } from 'src/modules/storage/s3.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Discount } from 'src/entities/discount.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, isScopedToUser, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { BillableSessionsService, MonthCount } from './billable-sessions.service';

describe('InvoiceService', () => {
    let service: InvoiceService;
    let invoiceRepo: MockRepository;
    let profileRepo: MockRepository;
    let discountRepo: MockRepository;
    let enrollmentRepo: MockRepository;
    let childRepo: MockRepository;
    let overrideRepo: MockRepository;
    let s3: { putObject: jest.Mock; downloadFile: jest.Mock };
    let transactionManager: { save: jest.Mock };
    /** E15/S9's one query, mute: what it counts is its own suite's business. */
    let billable: { countForMonth: jest.Mock };

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
        childRepo = createMockRepository();
        overrideRepo = createMockRepository();
        s3 = { putObject: jest.fn(), downloadFile: jest.fn() };
        billable = { countForMonth: jest.fn() };

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
                provideMockRepository(Child, childRepo),
                provideMockRepository(SessionCountOverride, overrideRepo),
                { provide: PdfService, useValue: { generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('')) } },
                { provide: S3Service, useValue: s3 },
                { provide: BillableSessionsService, useValue: billable },
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

    /**
     * A month as `BillableSessionsService` hands it over: one family (parent 1), Maria (5) with
     * two held sessions, in Scratch on Mondays. The count is the query's; this suite is about what
     * the service does with it.
     */
    const aMonth = (overrides: Partial<MonthCount> = {}): MonthCount => ({
        month: '2026-10',
        from: '2026-10-05',
        to: '2026-11-01',
        counts: new Map([
            [
                5,
                {
                    sessions: 2,
                    lines: [
                        { sessionId: 1, date: '2026-10-05', isVacation: false, present: true, counted: true },
                        { sessionId: 2, date: '2026-10-12', isVacation: false, present: false, counted: true },
                    ],
                },
            ],
        ]),
        children: [{ childId: 5, firstName: 'Maria', lastName: 'Pop', parentId: 1, groupId: 2, groupName: 'Scratch', weekday: 1 }],
        unmarked: [{ sessionId: 3, groupId: 2, groupName: 'Scratch', date: '2026-10-19', startTime: '16:00:00' }],
        ...overrides,
    });

    describe('getWorksheet', () => {
        beforeEach(() => {
            billable.countForMonth.mockResolvedValue(aMonth());
            invoiceRepo.find!.mockResolvedValue([]);
            profileRepo.find!.mockResolvedValue([{ id: 1, firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com' }]);
            discountRepo.find!.mockResolvedValue([]);
            overrideRepo.find!.mockResolvedValue([]);
        });

        it('bills the correction on file instead of the count, and shows both', async () => {
            overrideRepo.find!.mockResolvedValue([{ child: { id: 5 }, monthIssued: '2026-10', sessions: 1, reason: 'A venit o dată' }]);

            const sheet = await service.getWorksheet('2026-10');

            // 1 × 87,50: the decided number reaches the price; the count stays visible beside it.
            expect(sheet.families[0].amount).toBe(87.5);
            expect(sheet.families[0].children[0]).toMatchObject({ sessions: 1, counted: 2, override: { sessions: 1, reason: 'A venit o dată' } });
        });

        it('carries the count as both numbers when nothing is on file', async () => {
            const sheet = await service.getWorksheet('2026-10');
            expect(sheet.families[0].children[0]).toMatchObject({ sessions: 2, counted: 2, override: null });
        });

        it('returns the month, its range, the unmarked sessions and one row per family, with the count read', async () => {
            const sheet = await service.getWorksheet('2026-10');

            expect(sheet).toMatchObject({ month: '2026-10', from: '2026-10-05', to: '2026-11-01' });
            expect(sheet.unmarked).toEqual([{ sessionId: 3, groupId: 2, groupName: 'Scratch', date: '2026-10-19', startTime: '16:00:00' }]);
            expect(sheet.families).toHaveLength(1);
            expect(sheet.families[0]).toMatchObject({
                parentId: 1,
                parentName: 'Pop Ana',
                email: 'ana@example.com',
                alreadyInvoiced: false,
                // 2 × 87,50 — the same number the invoice will carry, so the screen shows it.
                amount: 175,
                children: [expect.objectContaining({ childId: 5, childName: 'Maria Pop', groupName: 'Scratch', weekday: 1, sessions: 2 })],
            });
            expect(sheet.families[0].children[0].lines).toHaveLength(2);
        });

        it('asks the one query for the month, and never counts on its own', async () => {
            await service.getWorksheet('2026-10');

            expect(billable.countForMonth).toHaveBeenCalledWith('2026-10');
            expect(enrollmentRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it("takes the month's discounts off the amount it shows", async () => {
            discountRepo.find!.mockResolvedValue([{ value: 50, parent: { id: 1 } }]);

            const sheet = await service.getWorksheet('2026-10');
            expect(sheet.families[0].amount).toBe(125);
        });

        it('lists a family with nothing held, at zero', async () => {
            billable.countForMonth.mockResolvedValue(aMonth({ counts: new Map([[5, { sessions: 0, lines: [] }]]) }));

            const sheet = await service.getWorksheet('2026-10');
            expect(sheet.families[0]).toMatchObject({ amount: 0, children: [expect.objectContaining({ sessions: 0 })] });
        });

        it('returns no families for a month nobody was enrolled in', async () => {
            billable.countForMonth.mockResolvedValue(aMonth({ counts: new Map(), children: [] }));

            const sheet = await service.getWorksheet('2026-10');
            expect(sheet.families).toEqual([]);
            expect(profileRepo.find).not.toHaveBeenCalled();
        });

        it('marks a family that already has an invoice for the month', async () => {
            invoiceRepo.find!.mockResolvedValue([{ id: 9, parent: { id: 1 } }]);

            // This is what makes the screen safe to run a second time after somebody enrols on the
            // fifth: `@Unique(['parent', 'monthIssued'])` fails the whole pass otherwise.
            const sheet = await service.getWorksheet('2026-10');
            expect(sheet.families[0].alreadyInvoiced).toBe(true);
        });
    });

    describe('issueFromSessions', () => {
        const october = { monthIssued: '2026-10', dateIssued: '2026-11-01' };

        beforeEach(() => {
            billable.countForMonth.mockResolvedValue(aMonth());
            invoiceRepo.find!.mockResolvedValue([]);
            profileRepo.find!.mockResolvedValue([{ id: 1, firstName: 'Ana', lastName: 'Pop', email: null }]);
            profileRepo.findOne!.mockImplementation(({ where }: { where: { id: number } }) => Promise.resolve(aProfile(where.id)));
            discountRepo.find!.mockResolvedValue([]);
            overrideRepo.find!.mockResolvedValue([]);
            transactionManager.save.mockImplementation((invoice: { amount: number }) => Promise.resolve({ ...invoice, id: 55 }));
        });

        it('bills the correction on file, through the same worksheet the screen showed', async () => {
            overrideRepo.find!.mockResolvedValue([{ child: { id: 5 }, monthIssued: '2026-10', sessions: 3, reason: null }]);

            const result = await service.issueFromSessions(october);
            expect(result.issued[0].amount).toBe(262.5);
        });

        it('bills what the registers say, and nothing the caller could have typed', async () => {
            const result = await service.issueFromSessions(october);

            // Two held sessions at the first-child rate. The DTO has no place for a count.
            expect(result.issued[0].amount).toBe(175);
            expect(billable.countForMonth).toHaveBeenCalledWith('2026-10');
        });

        it("takes the month's discounts off", async () => {
            discountRepo.find!.mockResolvedValue([{ value: 50, parent: { id: 1 } }]);

            const result = await service.issueFromSessions(october);
            expect(result.issued[0].amount).toBe(125);
        });

        it('records a month that comes to nothing, without a PDF', async () => {
            billable.countForMonth.mockResolvedValue(aMonth({ counts: new Map([[5, { sessions: 0, lines: [] }]]) }));

            const result = await service.issueFromSessions(october);

            // The row is the point: no invoice at all looks the same as a month nobody got round to.
            expect(result.issued).toHaveLength(0);
            expect(result.waived).toHaveLength(1);
            expect(result.waived[0].status).toBe(InvoiceStatus.WAIVED);
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it('skips a family already invoiced rather than failing the whole pass', async () => {
            invoiceRepo.find!.mockResolvedValue([{ id: 9, parent: { id: 1 } }]);

            const result = await service.issueFromSessions(october);

            expect(result.skipped).toEqual([{ parentId: 1, reason: 'ALREADY_INVOICED' }]);
            expect(result.issued).toHaveLength(0);
            expect(transactionManager.save).not.toHaveBeenCalled();
        });

        it('prints the date it was given, not the first of the teaching month', async () => {
            await service.issueFromSessions(october);

            // The 14-day term (E16/S7) runs from this date, and the month can only be issued once
            // its last register exists — which is the following month.
            expect(transactionManager.save).toHaveBeenCalledWith(expect.objectContaining({ dateIssued: new Date('2026-11-01'), monthIssued: '2026-10' }));
        });
    });

    describe('setSessionCountOverride', () => {
        const decision = { monthIssued: '2026-10', childId: 5, sessions: 3 };

        beforeEach(() => {
            childRepo.findOne!.mockResolvedValue({ id: 5, parent: { id: 1 } });
            invoiceRepo.findOne!.mockResolvedValue(null);
            overrideRepo.findOne!.mockResolvedValue(null);
            overrideRepo.create!.mockImplementation((row: object) => ({ ...row }));
            overrideRepo.save!.mockImplementation((row: object) => Promise.resolve({ id: 7, ...row }));
        });

        it('records the number, the reason and who decided', async () => {
            await service.setSessionCountOverride({ ...decision, reason: 'A venit doar la trei' }, 42);

            expect(overrideRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ monthIssued: '2026-10', sessions: 3, reason: 'A venit doar la trei', createdBy: { id: 42 } }),
            );
        });

        it('replaces the decision already on file rather than adding a second', async () => {
            overrideRepo.findOne!.mockResolvedValue({ id: 7, monthIssued: '2026-10', sessions: 3, reason: 'first' });

            await service.setSessionCountOverride({ ...decision, sessions: 2 }, 42);

            expect(overrideRepo.create).not.toHaveBeenCalled();
            expect(overrideRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 7, sessions: 2, reason: null }));
        });

        it("refuses once the family's month is issued", async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 9 });

            await expect(service.setSessionCountOverride(decision, 42)).rejects.toThrow(ConflictException);
            await expect(service.clearSessionCountOverride('2026-10', 5)).rejects.toThrow(ConflictException);
            expect(overrideRepo.save).not.toHaveBeenCalled();
            expect(overrideRepo.delete).not.toHaveBeenCalled();
        });

        it('knows no such child', async () => {
            childRepo.findOne!.mockResolvedValue(null);

            await expect(service.setSessionCountOverride(decision, 42)).rejects.toThrow(NotFoundException);
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
