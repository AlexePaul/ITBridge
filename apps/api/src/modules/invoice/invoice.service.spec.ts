import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, EntityManager } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { Child } from 'src/entities/child.entity';
import { SessionCountOverride } from 'src/entities/session-count-override.entity';
import { PdfService } from './pdf.service';
import { ObjectNotFoundError, S3Service } from 'src/modules/storage/s3.service';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Discount } from 'src/entities/discount.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, isScopedToUser, MockRepository, provideMockRepository } from 'src/testing/repository.mock';
import { BillableSessionsService, MonthCount } from './billable-sessions.service';
import { FiscalIssuingService } from './fiscal-issuing.service';
import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { PaymentService } from 'src/modules/payment/payment.service';
import { Payment } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';

describe('InvoiceService', () => {
    /** E07/S3. What reached the trail, and with which manager. */
    let audit: { record: jest.Mock; recordUpdate: jest.Mock };
    let service: InvoiceService;
    let invoiceRepo: MockRepository;
    let profileRepo: MockRepository;
    let discountRepo: MockRepository;
    let enrollmentRepo: MockRepository;
    let childRepo: MockRepository;
    let overrideRepo: MockRepository;
    let s3: { putObject: jest.Mock; downloadFile: jest.Mock; deleteObject: jest.Mock };
    let transactionManager: { save: jest.Mock; delete: jest.Mock; update: jest.Mock; findOne: jest.Mock; count: jest.Mock };
    /** The one door that derives an invoice's status from its payments. */
    let payments: { recomputeInvoiceStatus: jest.Mock };
    /** E15/S9's one query, mute: what it counts is its own suite's business. */
    let billable: { countForMonth: jest.Mock };
    /** E16/S2's queue: only the PDF fetch is reached from here. */
    let fiscal: { storeFiscalPdf: jest.Mock };

    const aProfile = (id = 1) => ({ id, firstName: 'Ana', lastName: 'Pop' });

    /**
     * How many of this family's children are actively enrolled — which is what the amount counts
     * since E11/S4. A trial is free, and a child in no group is not attending.
     */
    const withEnrolledChildren = (n: number) => {
        enrollmentRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ count: n }));
    };

    /** Whoever pressed the button, in the shape `actorFrom` hands over. */
    const ACTOR = { userId: 42, username: 'admin' };

    beforeEach(async () => {
        invoiceRepo = createMockRepository();
        profileRepo = createMockRepository();
        discountRepo = createMockRepository();
        enrollmentRepo = createMockRepository();
        childRepo = createMockRepository();
        overrideRepo = createMockRepository();
        s3 = { putObject: jest.fn(), downloadFile: jest.fn(), deleteObject: jest.fn() };
        billable = { countForMonth: jest.fn() };
        fiscal = { storeFiscalPdf: jest.fn() };

        // `createInvoice` writes the row and uploads the PDF inside one transaction. The fake runs
        // the callback with a manager whose `save` behaves like the repository's, so a rejected
        // upload propagates exactly as it would in production.
        transactionManager = { save: jest.fn(), delete: jest.fn(), update: jest.fn(), findOne: jest.fn(), count: jest.fn().mockResolvedValue(0) };
        payments = { recomputeInvoiceStatus: jest.fn().mockResolvedValue({ paid: 0, outstanding: 350, status: InvoiceStatus.PENDING }) };

        audit = { record: jest.fn(() => Promise.resolve()), recordUpdate: jest.fn(() => Promise.resolve()) };

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
                { provide: AuditService, useValue: audit },
                { provide: FiscalIssuingService, useValue: fiscal },
                { provide: PaymentService, useValue: payments },
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

            const created = await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' }, ACTOR);

            expect(created).toHaveLength(1);
            expect(transactionManager.save).toHaveBeenCalledWith(
                expect.objectContaining({ amount: 350, monthIssued: '2026-03', status: InvoiceStatus.PENDING }),
            );
        });

        it('issues the invoice as PENDING, not as paid', async () => {
            setUpHappyPath();

            await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' }, ACTOR);

            expect((transactionManager.save.mock.calls[0][0] as { status: InvoiceStatus }).status).toBe(InvoiceStatus.PENDING);
        });

        // E15/S6: a hundred parents used to be a hundred renders and uploads inside one open
        // transaction. The document is drawn on its first download instead.
        it('draws no PDF and touches no storage while issuing', async () => {
            setUpHappyPath();
            const pdf = (service as unknown as { pdfService: { generateInvoicePdf: jest.Mock } }).pdfService;

            await service.createInvoice({ parentIds: [10], monthIssued: '2026-03', dateIssued: '2026-03-01' }, ACTOR);

            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it('processes several parents in a single request', async () => {
            setUpHappyPath();

            const created = await service.createInvoice(
                {
                    parentIds: [10, 11],
                    monthIssued: '2026-03',
                    dateIssued: '2026-03-01',
                },
                ACTOR,
            );

            expect(created).toHaveLength(2);
        });

        it('rejects a non-existent parent before saving anything', async () => {
            profileRepo.findOne!.mockResolvedValue(null);

            await expect(service.createInvoice({ parentIds: [99], monthIssued: '2026-03', dateIssued: '2026-03-01' }, ACTOR)).rejects.toThrow(
                NotFoundException,
            );

            expect(invoiceRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('updateInvoice', () => {
        it('changes only the fields that were sent', async () => {
            const invoice = { id: 1, amount: 350, status: InvoiceStatus.PENDING, dateIssued: new Date(2026, 2, 1) };
            invoiceRepo.findOne!.mockResolvedValue(invoice);

            await service.updateInvoice(1, { dateIssued: '2026-03-05' }, ACTOR);

            // A local calendar day, never `new Date('2026-03-05')` — UTC midnight, the 4th west of Greenwich.
            expect(transactionManager.update).toHaveBeenCalledWith(Invoice, 1, { dateIssued: new Date(2026, 2, 5) });
            expect(invoice.amount).toBe(350);
            // Only an amount is weighed against the payments; a date moves nothing they decide.
            expect(payments.recomputeInvoiceStatus).not.toHaveBeenCalled();
        });

        /**
         * The review of 25 September 2026: the status is derived, never typed, and an amount edit
         * derives it again — before, `if (dto.amount)` dropped a zero and a lowered amount left a
         * paid invoice `pending` for ever.
         */
        describe('an amount edit re-derives the status', () => {
            const pending = { id: 1, amount: 350, status: InvoiceStatus.PENDING, dateIssued: new Date(2026, 2, 1), monthIssued: '2026-03' };

            it('from the payments, through the door that derives it', async () => {
                invoiceRepo.findOne!.mockResolvedValue({ ...pending });
                transactionManager.findOne.mockResolvedValue({ ...pending, fiscalStatus: null });
                payments.recomputeInvoiceStatus.mockResolvedValue({ paid: 200, outstanding: 0, status: InvoiceStatus.PAID });

                const updated = await service.updateInvoice(1, { amount: 200 }, ACTOR);

                expect(transactionManager.update).toHaveBeenCalledWith(Invoice, 1, { amount: 200 });
                expect(payments.recomputeInvoiceStatus).toHaveBeenCalledWith(1, transactionManager);
                expect(updated.status).toBe(InvoiceStatus.PAID);
            });

            it('takes zero, and the month becomes waived and leaves the fiscal queue', async () => {
                invoiceRepo.findOne!.mockResolvedValue({ ...pending });
                transactionManager.findOne.mockResolvedValue({ ...pending, fiscalStatus: InvoiceFiscalStatus.PENDING });
                payments.recomputeInvoiceStatus.mockResolvedValue({ paid: 0, outstanding: 0, status: InvoiceStatus.WAIVED });

                const updated = await service.updateInvoice(1, { amount: 0 }, ACTOR);

                expect(transactionManager.update).toHaveBeenCalledWith(Invoice, 1, {
                    amount: 0,
                    status: InvoiceStatus.WAIVED,
                    fiscalStatus: null,
                    fiscalNextAttemptAt: null,
                });
                expect(updated.status).toBe(InvoiceStatus.WAIVED);
            });

            it('refuses zero while money sits on the invoice', async () => {
                invoiceRepo.findOne!.mockResolvedValue({ ...pending });
                transactionManager.findOne.mockResolvedValue({ ...pending, fiscalStatus: null });
                transactionManager.count.mockResolvedValue(1);

                await expect(service.updateInvoice(1, { amount: 0 }, ACTOR)).rejects.toMatchObject({
                    response: expect.objectContaining({ error: 'INVOICE_HAS_PAYMENTS' }),
                });
                expect(transactionManager.count).toHaveBeenCalledWith(Payment, {
                    where: { invoice: { id: 1 }, status: expect.objectContaining({ _value: [PaymentStatus.SUCCEEDED, PaymentStatus.INITIATED] }) },
                });
                expect(transactionManager.update).not.toHaveBeenCalled();
            });

            it('gives a waived month an amount, and it is owed again', async () => {
                const waived = { ...pending, amount: 0, status: InvoiceStatus.WAIVED };
                invoiceRepo.findOne!.mockResolvedValue({ ...waived });
                transactionManager.findOne.mockResolvedValue({ ...waived, fiscalStatus: null });

                const updated = await service.updateInvoice(1, { amount: 350 }, ACTOR);

                // `off` by default: owed again, with nothing for SmartBill.
                expect(transactionManager.update).toHaveBeenCalledWith(Invoice, 1, {
                    amount: 350,
                    status: InvoiceStatus.PENDING,
                    fiscalStatus: null,
                    fiscalNextAttemptAt: null,
                });
                expect(updated.status).toBe(InvoiceStatus.PENDING);
            });

            it('leaves the status out of the trail: it moved because the amount did', async () => {
                invoiceRepo.findOne!.mockResolvedValue({ ...pending });
                transactionManager.findOne.mockResolvedValue({ ...pending, fiscalStatus: null });
                payments.recomputeInvoiceStatus.mockResolvedValue({ paid: 200, outstanding: 0, status: InvoiceStatus.PAID });

                await service.updateInvoice(1, { amount: 200 }, ACTOR);

                const entry = audit.recordUpdate.mock.calls[0][0] as { before: { status: string }; after: { status: string } };
                expect(entry.after.status).toBe(entry.before.status);
            });
        });

        // E07/S3. The trail entry and the change it describes commit together, so the record is
        // written with the transaction's manager and holds only what moved.
        it('writes down what moved, with the transaction that moved it', async () => {
            invoiceRepo.findOne!.mockResolvedValue({
                id: 1,
                amount: 350,
                status: InvoiceStatus.PENDING,
                dateIssued: new Date('2026-03-01'),
                monthIssued: '2026-03',
            });
            transactionManager.save.mockImplementation((_entity: unknown, i: unknown) => Promise.resolve(i));

            await service.updateInvoice(1, { amount: 150 }, ACTOR);

            expect(audit.recordUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: ACTOR,
                    entityType: 'Invoice',
                    entityId: 1,
                    before: expect.objectContaining({ amount: 350 }),
                    after: expect.objectContaining({ amount: 150 }),
                }),
                transactionManager,
            );
        });

        it('rejects an invoice that does not exist', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);
            await expect(service.updateInvoice(99, { amount: 1 }, ACTOR)).rejects.toThrow(NotFoundException);
        });
    });

    describe('deleteInvoice', () => {
        it('deletes an existing invoice', async () => {
            invoiceRepo.findOne!.mockResolvedValue({
                id: 1,
                amount: 350,
                status: InvoiceStatus.PENDING,
                dateIssued: new Date('2026-03-01'),
                monthIssued: '2026-03',
            });

            await service.deleteInvoice(1, ACTOR);

            expect(transactionManager.delete).toHaveBeenCalledWith(Invoice, 1);
        });

        // After the delete there is nothing left to look at, so the entry carries what the row held.
        it('keeps what the row held, in the transaction that removed it', async () => {
            invoiceRepo.findOne!.mockResolvedValue({
                id: 1,
                amount: 350,
                status: InvoiceStatus.PENDING,
                dateIssued: new Date('2026-03-01'),
                monthIssued: '2026-03',
            });

            await service.deleteInvoice(1, ACTOR);

            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: AuditAction.DELETED,
                    entityType: 'Invoice',
                    entityId: 1,
                    changes: expect.objectContaining({ amount: { from: 350, to: null } }),
                }),
                transactionManager,
            );
        });

        it('rejects a non-existent invoice without deleting anything', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);

            await expect(service.deleteInvoice(99, ACTOR)).rejects.toThrow(NotFoundException);
            expect(invoiceRepo.delete).not.toHaveBeenCalled();
        });

        // The review of 25 September 2026: `payments.invoice_id` cascades, so the delete took every
        // payment with it, and nothing said they had existed. Any status counts.
        it('refuses an invoice with payments recorded against it', async () => {
            invoiceRepo.findOne!.mockResolvedValue({
                id: 1,
                amount: 350,
                status: InvoiceStatus.PAID,
                dateIssued: new Date(2026, 2, 1),
                monthIssued: '2026-03',
            });
            transactionManager.count.mockResolvedValue(1);

            await expect(service.deleteInvoice(1, ACTOR)).rejects.toMatchObject({ response: expect.objectContaining({ error: 'INVOICE_HAS_PAYMENTS' }) });
            expect(transactionManager.count).toHaveBeenCalledWith(Payment, { where: { invoice: { id: 1 } } });
            expect(transactionManager.delete).not.toHaveBeenCalled();
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

            const result = await service.issueFromSessions(october, ACTOR);
            expect(result.issued[0].amount).toBe(262.5);
        });

        it('bills what the registers say, and nothing the caller could have typed', async () => {
            const result = await service.issueFromSessions(october, ACTOR);

            // Two held sessions at the first-child rate. The DTO has no place for a count.
            expect(result.issued[0].amount).toBe(175);
            expect(billable.countForMonth).toHaveBeenCalledWith('2026-10');
        });

        it("takes the month's discounts off", async () => {
            discountRepo.find!.mockResolvedValue([{ value: 50, parent: { id: 1 } }]);

            const result = await service.issueFromSessions(october, ACTOR);
            expect(result.issued[0].amount).toBe(125);
        });

        it('records a month that comes to nothing, without a PDF', async () => {
            billable.countForMonth.mockResolvedValue(aMonth({ counts: new Map([[5, { sessions: 0, lines: [] }]]) }));

            const result = await service.issueFromSessions(october, ACTOR);

            // The row is the point: no invoice at all looks the same as a month nobody got round to.
            expect(result.issued).toHaveLength(0);
            expect(result.waived).toHaveLength(1);
            expect(result.waived[0].status).toBe(InvoiceStatus.WAIVED);
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it('skips a family already invoiced rather than failing the whole pass', async () => {
            invoiceRepo.find!.mockResolvedValue([{ id: 9, parent: { id: 1 } }]);

            const result = await service.issueFromSessions(october, ACTOR);

            expect(result.skipped).toEqual([{ parentId: 1, reason: 'ALREADY_INVOICED' }]);
            expect(result.issued).toHaveLength(0);
            expect(transactionManager.save).not.toHaveBeenCalled();
        });

        // E07/S3. "Who issued this family's October" is answered per invoice, not per batch: the
        // question is always asked about one row.
        it('writes down who issued each invoice', async () => {
            const result = await service.issueFromSessions(october, ACTOR);

            expect(audit.record).toHaveBeenCalledTimes(result.issued.length + result.waived.length);
            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({ actor: ACTOR, action: AuditAction.CREATED, entityType: 'Invoice' }),
                transactionManager,
            );
        });

        it('prints the date it was given, not the first of the teaching month', async () => {
            await service.issueFromSessions(october, ACTOR);

            // The 14-day term (E16/S7) runs from this date, and the month can only be issued once
            // its last register exists — which is the following month. A local calendar day: through
            // UTC, the `date` column stores the 31st of October west of Greenwich.
            expect(transactionManager.save).toHaveBeenCalledWith(expect.objectContaining({ dateIssued: new Date(2026, 10, 1), monthIssued: '2026-10' }));
        });
    });

    describe('setSessionCountOverride', () => {
        const decision = { monthIssued: '2026-10', childId: 5, sessions: 3 };

        beforeEach(() => {
            childRepo.findOne!.mockResolvedValue({ id: 5, parent: { id: 1 } });
            invoiceRepo.findOne!.mockResolvedValue(null);
            overrideRepo.findOne!.mockResolvedValue(null);
            overrideRepo.create!.mockImplementation((row: object) => ({ ...row }));
            transactionManager.save.mockImplementation((_entity: unknown, row: object) => Promise.resolve({ id: 7, ...row }));
        });

        it('records the number, the reason and who decided', async () => {
            await service.setSessionCountOverride({ ...decision, reason: 'A venit doar la trei' }, 42, ACTOR);

            expect(transactionManager.save).toHaveBeenCalledWith(
                SessionCountOverride,
                expect.objectContaining({ monthIssued: '2026-10', sessions: 3, reason: 'A venit doar la trei', createdBy: { id: 42 } }),
            );
        });

        it('replaces the decision already on file rather than adding a second', async () => {
            overrideRepo.findOne!.mockResolvedValue({ id: 7, monthIssued: '2026-10', sessions: 3, reason: 'first' });

            await service.setSessionCountOverride({ ...decision, sessions: 2 }, 42, ACTOR);

            expect(overrideRepo.create).not.toHaveBeenCalled();
            expect(transactionManager.save).toHaveBeenCalledWith(SessionCountOverride, expect.objectContaining({ id: 7, sessions: 2, reason: null }));
        });

        // E07/S3. The row keeps only the decision standing now; "four, then two, then four again"
        // is readable in the trail or nowhere.
        it('writes the first decision down as a creation, and the second as what moved', async () => {
            await service.setSessionCountOverride({ ...decision, reason: 'A venit doar la trei' }, 42, ACTOR);

            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: AuditAction.CREATED,
                    entityType: 'SessionCountOverride',
                    entityId: 7,
                    changes: expect.objectContaining({ sessions: { from: null, to: 3 } }),
                    note: 'copil 5, luna 2026-10',
                }),
                transactionManager,
            );

            audit.record.mockClear();
            overrideRepo.findOne!.mockResolvedValue({ id: 7, monthIssued: '2026-10', sessions: 3, reason: 'first' });

            await service.setSessionCountOverride({ ...decision, sessions: 2 }, 42, ACTOR);

            expect(audit.record).not.toHaveBeenCalled();
            expect(audit.recordUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    entityType: 'SessionCountOverride',
                    before: { sessions: 3, reason: 'first' },
                    after: { sessions: 2, reason: null },
                }),
                transactionManager,
            );
        });

        // A delete that removed no row would otherwise leave an entry claiming a decision was
        // withdrawn that nobody ever made.
        it('records nothing when there was no decision to clear', async () => {
            await service.clearSessionCountOverride('2026-10', 5, ACTOR);

            expect(transactionManager.delete).not.toHaveBeenCalled();
            expect(audit.record).not.toHaveBeenCalled();
        });

        it("refuses once the family's month is issued", async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 9 });

            await expect(service.setSessionCountOverride(decision, 42, ACTOR)).rejects.toThrow(ConflictException);
            await expect(service.clearSessionCountOverride('2026-10', 5, ACTOR)).rejects.toThrow(ConflictException);
            expect(overrideRepo.save).not.toHaveBeenCalled();
            expect(overrideRepo.delete).not.toHaveBeenCalled();
        });

        it('knows no such child', async () => {
            childRepo.findOne!.mockResolvedValue(null);

            await expect(service.setSessionCountOverride(decision, 42, ACTOR)).rejects.toThrow(NotFoundException);
        });
    });

    /**
     * E16/S2 — what issuing does in each SmartBill mode, and the guards that keep the platform's row
     * from drifting away from a fiscal document it cannot touch.
     */
    describe('SmartBill', () => {
        const october = { monthIssued: '2026-10', dateIssued: '2026-11-01' };
        let pdf: { generateInvoicePdf: jest.Mock };

        beforeEach(() => {
            pdf = (service as unknown as { pdfService: { generateInvoicePdf: jest.Mock } }).pdfService;
            billable.countForMonth.mockResolvedValue(aMonth());
            invoiceRepo.find!.mockResolvedValue([]);
            profileRepo.find!.mockResolvedValue([{ id: 1, firstName: 'Ana', lastName: 'Pop', email: null }]);
            profileRepo.findOne!.mockImplementation(({ where }: { where: { id: number } }) => Promise.resolve(aProfile(where.id)));
            discountRepo.find!.mockResolvedValue([]);
            overrideRepo.find!.mockResolvedValue([]);
            transactionManager.save.mockImplementation((invoice: object) => Promise.resolve({ ...invoice, id: 55 }));
        });

        afterEach(() => {
            delete process.env.SMARTBILL_MODE;
        });

        // E15/S6: issuing is database work only, in every mode. The platform's PDF is drawn on its
        // first download; SmartBill's document is the queue's.
        it("queues nothing in 'off', and draws nothing while issuing", async () => {
            const result = await service.issueFromSessions(october, ACTOR);

            expect(result.issued[0].fiscalStatus).toBeNull();
            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it("queues the invoice in 'draft', drawing nothing yet — the first download does", async () => {
            process.env.SMARTBILL_MODE = 'draft';

            const result = await service.issueFromSessions(october, ACTOR);

            expect(result.issued[0].fiscalStatus).toBe(InvoiceFiscalStatus.PENDING);
            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        // E15/S7: in live the PDF is SmartBill's. A second document for the month, with no series
        // and no number, is the "not an invoice" E16 opens with.
        it("queues the invoice in 'live' and writes no PDF of its own", async () => {
            process.env.SMARTBILL_MODE = 'live';

            const result = await service.issueFromSessions(october, ACTOR);

            expect(result.issued[0].fiscalStatus).toBe(InvoiceFiscalStatus.PENDING);
            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
            expect(s3.putObject).not.toHaveBeenCalled();
        });

        it('queues nothing for a waived month, in any mode', async () => {
            process.env.SMARTBILL_MODE = 'live';
            billable.countForMonth.mockResolvedValue(aMonth({ counts: new Map([[5, { sessions: 0, lines: [] }]]) }));

            const result = await service.issueFromSessions(october, ACTOR);

            expect(result.waived[0].fiscalStatus).toBeNull();
        });

        const issuedInvoice = { id: 1, amount: 350, status: InvoiceStatus.PENDING, dateIssued: new Date('2026-11-01'), monthIssued: '2026-10' };

        it('refuses to change the amount of an invoice issued in SmartBill', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ ...issuedInvoice });
            transactionManager.findOne.mockResolvedValue({ id: 1, fiscalStatus: InvoiceFiscalStatus.ISSUED });

            await expect(service.updateInvoice(1, { amount: 150 }, ACTOR)).rejects.toThrow(ConflictException);
            expect(transactionManager.update).not.toHaveBeenCalled();
        });

        // The race this rewrite closed: a whole-entity `save` of a row read before the transaction
        // would put the fiscal columns back as they were read — here, a refused invoice back in the
        // queue as the `pending` it was when read.
        it('writes only the field that was sent, never the fiscal columns it read earlier', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ ...issuedInvoice, fiscalStatus: InvoiceFiscalStatus.PENDING });
            transactionManager.findOne.mockResolvedValue({ ...issuedInvoice, fiscalStatus: InvoiceFiscalStatus.FAILED });

            await service.updateInvoice(1, { amount: 300 }, ACTOR);

            expect(transactionManager.update).toHaveBeenCalledWith(Invoice, 1, { amount: 300 });
            expect(transactionManager.save).not.toHaveBeenCalled();
        });

        it('refuses to delete an invoice whose fiscal document exists, or may', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ ...issuedInvoice });
            for (const fiscalStatus of [InvoiceFiscalStatus.ISSUED, InvoiceFiscalStatus.UNCERTAIN, InvoiceFiscalStatus.REVIEW]) {
                transactionManager.findOne.mockResolvedValue({ id: 1, fiscalStatus });
                await expect(service.deleteInvoice(1, ACTOR)).rejects.toThrow(ConflictException);
            }
            expect(transactionManager.delete).not.toHaveBeenCalled();
        });

        it('lets a draft go: it is not a fiscal document', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ ...issuedInvoice });
            transactionManager.findOne.mockResolvedValue({ id: 1, fiscalStatus: InvoiceFiscalStatus.DRAFT });

            await service.deleteInvoice(1, ACTOR);

            expect(transactionManager.delete).toHaveBeenCalledWith(Invoice, 1);
            // E15/S6: the kept drawing goes with its row.
            expect(s3.deleteObject).toHaveBeenCalledWith('invoices/2026-10/1.pdf');
        });

        it("hands over SmartBill's PDF when it was not kept yet", async () => {
            const qb = createMockQueryBuilder({
                one: { ...issuedInvoice, fiscalStatus: InvoiceFiscalStatus.ISSUED, fiscalSeries: 'ITB', fiscalNumber: '0041' },
            });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);
            s3.downloadFile.mockRejectedValue(new ObjectNotFoundError('invoices/2026-10/1.pdf'));
            fiscal.storeFiscalPdf.mockResolvedValue(Buffer.from('%PDF fiscal'));

            await expect(service.getInvoicePdf(1, Role.ADMIN, 42)).resolves.toEqual(Buffer.from('%PDF fiscal'));
            expect(fiscal.storeFiscalPdf).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'ITB', '0041');
        });

        it("says the fiscal invoice is not issued yet in 'live', rather than drawing one of its own", async () => {
            process.env.SMARTBILL_MODE = 'live';
            const qb = createMockQueryBuilder({ one: { ...issuedInvoice, fiscalStatus: InvoiceFiscalStatus.PENDING } });
            invoiceRepo.createQueryBuilder!.mockReturnValue(qb);
            s3.downloadFile.mockRejectedValue(new ObjectNotFoundError('invoices/2026-10/1.pdf'));

            await expect(service.getInvoicePdf(1, Role.ADMIN, 42)).rejects.toMatchObject({
                response: expect.objectContaining({ error: 'FISCAL_INVOICE_NOT_ISSUED_YET' }),
            });
            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
        });
    });

    /**
     * E15/S6 — the platform's PDF is drawn from the row on its first download and kept, and a kept
     * drawing of figures the row no longer holds is dropped.
     */
    describe('the platform PDF, drawn on first download', () => {
        const invoice = { id: 1, amount: 350, status: InvoiceStatus.PENDING, dateIssued: '2026-11-01', monthIssued: '2026-10', fiscalStatus: null };
        let pdf: { generateInvoicePdf: jest.Mock };

        beforeEach(() => {
            pdf = (service as unknown as { pdfService: { generateInvoicePdf: jest.Mock } }).pdfService;
            pdf.generateInvoicePdf.mockResolvedValue(Buffer.from('%PDF drawn'));
            s3.downloadFile.mockRejectedValue(new ObjectNotFoundError('invoices/2026-10/1.pdf'));
        });

        afterEach(() => {
            delete process.env.SMARTBILL_MODE;
        });

        it('draws it, keeps it, and hands it over', async () => {
            invoiceRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { ...invoice } }));

            await expect(service.getInvoicePdf(1, Role.ADMIN, 42)).resolves.toEqual(Buffer.from('%PDF drawn'));
            expect(pdf.generateInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
            expect(s3.putObject).toHaveBeenCalledWith({ key: 'invoices/2026-10/1.pdf', body: Buffer.from('%PDF drawn'), contentType: 'application/pdf' });
        });

        it('hands over the drawing even when keeping it fails — the row is the record', async () => {
            invoiceRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { ...invoice } }));
            s3.putObject.mockRejectedValue(new Error('storage down'));

            await expect(service.getInvoicePdf(1, Role.ADMIN, 42)).resolves.toEqual(Buffer.from('%PDF drawn'));
        });

        it('serves the kept one without drawing again', async () => {
            invoiceRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { ...invoice } }));
            s3.downloadFile.mockResolvedValue(Buffer.from('%PDF kept'));

            await expect(service.getInvoicePdf(1, Role.ADMIN, 42)).resolves.toEqual(Buffer.from('%PDF kept'));
            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
        });

        // Before E15/S6 the family had a PDF from the moment of issue in `draft`; it still does.
        it("draws one for an invoice still on its way to SmartBill in 'draft'", async () => {
            process.env.SMARTBILL_MODE = 'draft';
            invoiceRepo.createQueryBuilder!.mockReturnValue(createMockQueryBuilder({ one: { ...invoice, fiscalStatus: InvoiceFiscalStatus.PENDING } }));

            await expect(service.getInvoicePdf(1, Role.ADMIN, 42)).resolves.toEqual(Buffer.from('%PDF drawn'));
        });

        it('drops the kept drawing when the amount or the date changes', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ ...invoice });
            transactionManager.findOne.mockResolvedValue({ id: 1, fiscalStatus: null });

            await service.updateInvoice(1, { amount: 300 }, ACTOR);
            await service.updateInvoice(1, { dateIssued: '2026-11-03' }, ACTOR);

            expect(s3.deleteObject).toHaveBeenCalledTimes(2);
            expect(s3.deleteObject).toHaveBeenCalledWith('invoices/2026-10/1.pdf');
        });

        it('keeps it when nothing printed moves', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ ...invoice });

            await service.updateInvoice(1, {}, ACTOR);

            expect(s3.deleteObject).not.toHaveBeenCalled();
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
