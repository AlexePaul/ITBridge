import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Payment, PaymentFiscalStatus } from 'src/entities/payment.entity';
import { Invoice, InvoiceFiscalStatus, InvoiceStatus } from 'src/entities/invoice.entity';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { Role } from 'src/enum/role.enum';
import {
    createMockEntityManager,
    createMockQueryBuilder,
    createMockRepository,
    isScopedToUser,
    MockEntityManager,
    MockRepository,
    provideMockDataSource,
    provideMockRepository,
} from 'src/testing/repository.mock';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';

describe('PaymentService', () => {
    let service: PaymentService;
    let paymentRepo: MockRepository;
    let invoiceRepo: MockRepository;
    let manager: MockEntityManager;
    /** E16/S6. What the family was told, if anything — the receipt is queued, never sent here. */
    let outbox: { queueOrRecord: jest.Mock };
    let templates: { render: jest.Mock };
    /** E07/S3. What went into the trail, and with which manager. */
    let audit: { record: jest.Mock; recordUpdate: jest.Mock };

    /** What the SUM(...) inside the recomputation answers, as the driver returns it: a string. */
    let paidSum: string | null;
    /** The invoice the recomputation reads back inside the transaction. */
    /**
     * `monthIssued` and `parent` are here because the columns are non-null and the relation is
     * loaded — the receipt in E16/S6 reads both, and a fixture thinner than the schema would only
     * be testing a shape the database cannot produce.
     */
    let invoiceInDb: {
        id: number;
        amount: number;
        status: InvoiceStatus;
        monthIssued: string;
        fiscalStatus: InvoiceFiscalStatus | null;
        parent: { id: number; firstName: string; email: string | null };
    };
    /**
     * The payment an edit or a delete finds, locked and then read with its relations. The update
     * double writes into it, so what the service reads back after its targeted `update` is what the
     * row would hold — the way `updatePayment` has to work since E16/S5.
     */
    let paymentInDb: Record<string, unknown> | null;

    beforeEach(async () => {
        paymentRepo = createMockRepository();
        invoiceRepo = createMockRepository();
        manager = createMockEntityManager();
        paidSum = null;
        paymentInDb = null;
        invoiceInDb = {
            id: 5,
            amount: 350,
            status: InvoiceStatus.PENDING,
            monthIssued: '2026-03',
            fiscalStatus: null,
            parent: { id: 3, firstName: 'Ana', email: 'ana@example.com' },
        };

        manager.findOne = jest.fn((entity: unknown) => Promise.resolve(entity === Payment ? paymentInDb : invoiceInDb)) as never;
        (manager as unknown as { findOneOrFail: jest.Mock }).findOneOrFail = jest.fn((entity: unknown) =>
            entity === Payment ? (paymentInDb ? Promise.resolve(paymentInDb) : Promise.reject(new Error('EntityNotFound'))) : Promise.resolve(invoiceInDb),
        );
        manager.update.mockImplementation((entity: unknown, _id: unknown, changes: Record<string, unknown>) => {
            if (entity === Payment && paymentInDb) Object.assign(paymentInDb, changes);
            return Promise.resolve({ affected: 1 });
        });
        manager.createQueryBuilder = jest.fn(() => {
            const qb: Record<string, jest.Mock> = {};
            for (const method of ['select', 'where', 'andWhere']) qb[method] = jest.fn(() => qb);
            qb.getRawOne = jest.fn(() => Promise.resolve({ paid: paidSum }));
            return qb;
        }) as never;
        manager.save.mockImplementation((_entity: unknown, data: Record<string, unknown>) => Promise.resolve({ id: 11, ...data }));

        outbox = { queueOrRecord: jest.fn(() => Promise.resolve({ id: 1 })) };
        audit = { record: jest.fn(() => Promise.resolve()), recordUpdate: jest.fn(() => Promise.resolve()) };
        // Echoes the key back as the subject so a test can assert *which* of the two receipts went,
        // without asserting the Romanian wording — that belongs to the template's own spec.
        templates = {
            render: jest.fn((key: string, data: Record<string, string>) => Promise.resolve({ subject: key, bodyText: JSON.stringify(data), bodyHtml: null })),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentService,
                provideMockRepository(Payment, paymentRepo),
                provideMockRepository(Invoice, invoiceRepo),
                provideMockDataSource(manager),
                { provide: OutboxService, useValue: outbox },
                { provide: MailTemplateService, useValue: templates },
                { provide: AuditService, useValue: audit },
            ],
        }).compile();

        service = module.get(PaymentService);
        invoiceRepo.findOne!.mockResolvedValue(invoiceInDb);
    });

    /** Whoever pressed the button, in the shape `actorFrom` hands over. */
    const ACTOR = { userId: 7, username: 'admin' };

    const create = (overrides: Record<string, unknown> = {}) =>
        service.createPayment({ invoiceId: 5, amount: 350, date: '2026-03-10', ...overrides }, 7, ACTOR);

    describe('createPayment', () => {
        it('saves the figure, and the derivation marks the invoice paid when it is covered', async () => {
            paidSum = '350';

            await create();

            expect(manager.save).toHaveBeenCalledWith(Payment, expect.objectContaining({ amount: 350 }));
            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PAID });
        });

        it('a partial payment leaves the invoice pending — the figure is the state, not the row count', async () => {
            paidSum = '200';

            await create({ amount: 200 });

            // The old model marked PAID because a payment row existed. That is the bug this
            // rework removes: 200 of 350 is not paid.
            expect(manager.update).not.toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PAID });
        });

        it('paying ahead still counts as paid — the sum is not capped at the total', async () => {
            paidSum = '400';
            await create({ amount: 400 });
            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PAID });
        });

        it('records who typed it in', async () => {
            await create();
            expect(manager.save).toHaveBeenCalledWith(Payment, expect.objectContaining({ recordedBy: { id: 7 } }));
        });

        it('defaults to cash and succeeded — an admin records money that arrived', async () => {
            await create();
            expect(manager.save).toHaveBeenCalledWith(Payment, expect.objectContaining({ method: PaymentMethod.CASH, status: PaymentStatus.SUCCEEDED }));
        });

        it('refuses a payment against a waived invoice — a waived month has nothing to pay', async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 5, amount: 0, status: InvoiceStatus.WAIVED });

            const error = await create().catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ConflictException);
            expect((error as ConflictException).getResponse()).toMatchObject({ error: 'INVOICE_WAIVED' });
            expect(manager.save).not.toHaveBeenCalled();
        });

        it('rejects a non-existent invoice without saving anything', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);
            await expect(create()).rejects.toThrow(NotFoundException);
            expect(manager.save).not.toHaveBeenCalled();
        });
    });

    describe('the derivation', () => {
        it('counts only succeeded payments — an initiated transfer pays nothing yet', async () => {
            // The SUM query filters on status; the double records what it was asked.
            await create({ status: PaymentStatus.INITIATED });

            const qb = (manager.createQueryBuilder as jest.Mock).mock.results[0].value as Record<string, jest.Mock>;
            expect(qb.andWhere).toHaveBeenCalledWith('payment.status = :status', { status: PaymentStatus.SUCCEEDED });
        });

        it('an uncovered overdue invoice stays overdue — lateness is about the calendar, not the balance', async () => {
            invoiceInDb.status = InvoiceStatus.OVERDUE;
            invoiceRepo.findOne!.mockResolvedValue(invoiceInDb);
            paidSum = '100';

            await create({ amount: 100 });

            expect(manager.update).not.toHaveBeenCalled();
        });

        it('a covered overdue invoice becomes paid', async () => {
            invoiceInDb.status = InvoiceStatus.OVERDUE;
            invoiceRepo.findOne!.mockResolvedValue(invoiceInDb);
            paidSum = '350';

            await create();

            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PAID });
        });

        it('never touches a waived invoice, even if a row somehow exists against it', async () => {
            invoiceInDb.status = InvoiceStatus.WAIVED;
            await service.recomputeInvoiceStatus(5, manager as never);
            expect(manager.update).not.toHaveBeenCalled();
        });

        it('holds the invoice row while it counts, so two payments in the same second cannot both miss the other', async () => {
            // Without the lock each transaction summed its own snapshot: 100 and 250 against a 350
            // lei invoice both read "still owing", the invoice stayed pending, and each family was
            // told a balance it had already cleared. The seat count in E11 had the same shape.
            await create();

            expect(manager.findOne).toHaveBeenCalledWith(Invoice, { where: { id: 5 }, lock: { mode: 'pessimistic_write' } });
        });

        it('takes it before the sum — a lock taken after the count guards a number already read', async () => {
            await create();

            const calls = (manager.findOne as jest.Mock).mock.calls;
            const lockedAt = calls.findIndex((call: unknown[]) => (call[1] as { lock?: unknown }).lock !== undefined);
            expect(lockedAt).toBeGreaterThanOrEqual(0);
            expect((manager.findOne as jest.Mock).mock.invocationCallOrder[lockedAt]).toBeLessThan(
                (manager.createQueryBuilder as jest.Mock).mock.invocationCallOrder[0],
            );
        });

        it('a zero-amount invoice is never derived to paid — zero paid of zero owed is not a payment', async () => {
            invoiceInDb.amount = 0;
            paidSum = null;
            await service.recomputeInvoiceStatus(5, manager as never);
            expect(manager.update).not.toHaveBeenCalled();
        });
    });

    describe('row-level authorization', () => {
        it('findPayments narrows nothing for an ADMIN', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.ADMIN, 42);

            expect(isScopedToUser(qb, 42)).toBe(false);
        });

        it('findPayments can ask only for what waits on somebody, whatever its date', async () => {
            // The screen shows a month at a time; these are the rows a month would hide from the
            // person who has to confirm or re-send them (review of 26 September 2026).
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({ needsAction: true }, Role.ADMIN, 42);

            expect(qb.andWhere).toHaveBeenCalledWith('(payment.status = :announced OR payment.fiscalStatus IN (:...toCheck))', {
                announced: 'initiated',
                toCheck: ['review', 'failed'],
            });
        });

        it('findPayments narrows to the authenticated user for a PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne narrows to the authenticated user for a PARENT', async () => {
            const qb = createMockQueryBuilder({ one: { id: 1 } });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findOne(1, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne throws NotFound when the payment belongs to another parent', async () => {
            const qb = createMockQueryBuilder({ one: null });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await expect(service.findOne(1, Role.PARENT, 42)).rejects.toThrow(NotFoundException);
        });

        // `findPayments` used to apply the narrowing block twice, adding the same
        // `leftJoin('parent.user', 'user')` and `andWhere('user.id = ...')` in two places, which
        // TypeORM rejects as a duplicate alias at execution time.
        it('adds the narrowing exactly once', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.PARENT, 42);

            expect(qb.leftJoinCalls.filter((r) => r === 'parent.user')).toHaveLength(1);
            expect(qb.andWhereCalls.filter(([c]) => c.includes('user.id'))).toHaveLength(1);
        });

        it('selects only id and username off the recording admin — never the credentials row', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.ADMIN, 42);

            // A leftJoinAndSelect here would put the whole account on the wire — `select: false` on
            // `passwordHash` is the second line of defence, not the first. The join must stay a bare
            // join plus a named addSelect.
            expect(qb.leftJoinCalls).toContain('payment.recordedBy');
            expect(qb.addSelect).toHaveBeenCalledWith(['recordedBy.id', 'recordedBy.username']);
        });

        it('does not join the recording admin at all for a parent', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.PARENT, 42);

            expect(qb.leftJoinCalls).not.toContain('payment.recordedBy');
            expect(qb.addSelect).not.toHaveBeenCalled();
        });
    });

    describe('updatePayment', () => {
        it('writes only the fields that were sent, and rederives', async () => {
            paymentInDb = {
                id: 1,
                amount: 350,
                method: PaymentMethod.CASH,
                status: PaymentStatus.SUCCEEDED,
                date: new Date(2026, 2, 1),
                fiscalStatus: null,
                invoice: invoiceInDb,
            };
            paidSum = '350';

            await service.updatePayment(1, { method: PaymentMethod.BANK_TRANSFER }, ACTOR);

            // A targeted update, never a save of the row read beforehand: since E16/S5 the row carries
            // the fiscal queue's state, and a stale whole-row save would write it back.
            expect(manager.update).toHaveBeenCalledWith(Payment, 1, { method: PaymentMethod.BANK_TRANSFER });
            expect(manager.save).not.toHaveBeenCalled();
            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PAID });
        });

        it('locks the payment before it reads it', async () => {
            paymentInDb = {
                id: 1,
                amount: 350,
                method: PaymentMethod.CASH,
                status: PaymentStatus.SUCCEEDED,
                date: new Date(2026, 2, 1),
                fiscalStatus: null,
                invoice: invoiceInDb,
            };

            await service.updatePayment(1, { notes: 'corectat' }, ACTOR);

            expect(manager.findOne).toHaveBeenCalledWith(Payment, { where: { id: 1 }, lock: { mode: 'pessimistic_write' } });
        });

        it('marking a payment reversed takes the invoice back off paid', async () => {
            paymentInDb = { id: 1, amount: 350, status: PaymentStatus.SUCCEEDED, date: new Date(2026, 2, 1), fiscalStatus: null, invoice: invoiceInDb };
            invoiceInDb.status = InvoiceStatus.PAID;
            paidSum = null;

            await service.updatePayment(1, { status: PaymentStatus.REVERSED }, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PENDING });
        });

        it('writes a changed day from its components, never through UTC', async () => {
            paymentInDb = { id: 1, amount: 350, status: PaymentStatus.SUCCEEDED, date: new Date(2026, 2, 1), fiscalStatus: null, invoice: invoiceInDb };

            await service.updatePayment(1, { date: '2026-03-10' }, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(Payment, 1, { date: new Date(2026, 2, 10) });
        });

        it('rejects a payment that does not exist', async () => {
            paymentInDb = null;
            await expect(service.updatePayment(99, { method: PaymentMethod.CASH }, ACTOR)).rejects.toThrow(NotFoundException);
        });
    });

    describe('deletePayment', () => {
        it('rederives the invoice state from what remains', async () => {
            paymentInDb = { id: 11, fiscalStatus: null, invoice: { id: 5 } };
            invoiceInDb.status = InvoiceStatus.PAID;
            paidSum = null;

            await service.deletePayment(11, ACTOR);

            expect(manager.delete).toHaveBeenCalledWith(Payment, 11);
            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PENDING });
        });

        it('rejects a payment that does not exist', async () => {
            paymentInDb = null;
            await expect(service.deletePayment(99, ACTOR)).rejects.toThrow(NotFoundException);
        });
    });

    /**
     * SmartBill — E16/S5. The rule of which payments owe a collection is in
     * `payment-fiscal.rules.spec.ts`; what is checked here is that the service writes it where the
     * queue reads it, and refuses the edits that would leave SmartBill holding a record the platform
     * no longer has.
     */
    describe('SmartBill', () => {
        afterEach(() => {
            delete process.env.SMARTBILL_MODE;
        });

        it('queues money recorded in live against an invoice SmartBill numbers', async () => {
            process.env.SMARTBILL_MODE = 'live';
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.ISSUED;

            await create();

            expect(manager.save).toHaveBeenCalledWith(
                Payment,
                expect.objectContaining({ fiscalStatus: PaymentFiscalStatus.PENDING, fiscalNextAttemptAt: expect.any(Date) }),
            );
        });

        it('waits with the invoice while SmartBill has not numbered it yet', async () => {
            process.env.SMARTBILL_MODE = 'live';
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.PENDING;

            await create();

            expect(manager.save).toHaveBeenCalledWith(Payment, expect.objectContaining({ fiscalStatus: PaymentFiscalStatus.PENDING }));
        });

        it("owes nothing in 'off', nor on a draft invoice, nor while the money is only announced", async () => {
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.ISSUED;
            await create();
            expect(manager.save).toHaveBeenLastCalledWith(Payment, expect.objectContaining({ fiscalStatus: null }));

            process.env.SMARTBILL_MODE = 'live';
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.DRAFT;
            await create();
            expect(manager.save).toHaveBeenLastCalledWith(Payment, expect.objectContaining({ fiscalStatus: null }));

            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.ISSUED;
            await create({ status: PaymentStatus.INITIATED });
            expect(manager.save).toHaveBeenLastCalledWith(Payment, expect.objectContaining({ fiscalStatus: null }));
        });

        const recorded = () => ({
            id: 11,
            amount: 350,
            method: PaymentMethod.CASH,
            status: PaymentStatus.SUCCEEDED,
            date: new Date(2026, 2, 10),
            externalReference: null,
            notes: null,
            fiscalStatus: PaymentFiscalStatus.RECORDED,
            invoice: invoiceInDb,
        });

        it('keeps the sum, the day and the method of a payment SmartBill holds', async () => {
            process.env.SMARTBILL_MODE = 'live';
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.ISSUED;

            for (const edit of [{ amount: 300 }, { date: '2026-03-11' }, { method: PaymentMethod.BANK_TRANSFER }]) {
                paymentInDb = recorded();
                const error = await service.updatePayment(11, edit, ACTOR).catch((e: unknown) => e);
                expect(error).toBeInstanceOf(ConflictException);
                expect((error as ConflictException).getResponse()).toMatchObject({ error: 'PAYMENT_RECORDED_IN_SMARTBILL' });
            }
            expect(manager.update).not.toHaveBeenCalledWith(Payment, 11, expect.anything());
        });

        it('lets it be reversed, and leaves its SmartBill state alone — the divergence report takes it from there', async () => {
            process.env.SMARTBILL_MODE = 'live';
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.ISSUED;
            paymentInDb = recorded();

            await service.updatePayment(11, { status: PaymentStatus.REVERSED, amount: 350 }, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(Payment, 11, { amount: 350, status: PaymentStatus.REVERSED });
            expect(paymentInDb.fiscalStatus).toBe(PaymentFiscalStatus.RECORDED);
        });

        it('queues a refused payment again once it has been corrected', async () => {
            process.env.SMARTBILL_MODE = 'live';
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.ISSUED;
            paymentInDb = { ...recorded(), fiscalStatus: PaymentFiscalStatus.FAILED, fiscalAttempts: 1, fiscalLastError: 'Refuzat' };

            await service.updatePayment(11, { amount: 300 }, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(
                Payment,
                11,
                expect.objectContaining({ amount: 300, fiscalStatus: PaymentFiscalStatus.PENDING, fiscalAttempts: 0, fiscalLastError: null }),
            );
        });

        it('takes a payment out of the queue when it stops being money before it was sent', async () => {
            process.env.SMARTBILL_MODE = 'live';
            invoiceInDb.fiscalStatus = InvoiceFiscalStatus.ISSUED;
            paymentInDb = { ...recorded(), fiscalStatus: PaymentFiscalStatus.PENDING };

            await service.updatePayment(11, { status: PaymentStatus.FAILED }, ACTOR);

            expect(manager.update).toHaveBeenCalledWith(Payment, 11, expect.objectContaining({ status: PaymentStatus.FAILED, fiscalStatus: null }));
        });

        it('refuses to delete a payment SmartBill holds, or may', async () => {
            for (const fiscalStatus of [PaymentFiscalStatus.RECORDED, PaymentFiscalStatus.UNCERTAIN, PaymentFiscalStatus.REVIEW]) {
                paymentInDb = { ...recorded(), fiscalStatus };
                const error = await service.deletePayment(11, ACTOR).catch((e: unknown) => e);
                expect((error as ConflictException).getResponse()).toMatchObject({ error: 'PAYMENT_RECORDED_IN_SMARTBILL' });
            }
            expect(manager.delete).not.toHaveBeenCalled();
        });
    });

    /**
     * The receipt — E16/S6.
     *
     * The rule about *when* is pinned in `payment-receipt.rules.spec.ts`. What is checked here is
     * the wiring the rule cannot see: that the message is queued rather than sent, that it rides
     * the caller's transaction, and that the figures in it come from the recomputation rather than
     * from a second subtraction.
     */
    describe('the receipt', () => {
        /** The values handed to the template, which the mock echoes back as JSON. */
        const rendered = () =>
            JSON.parse(templates.render.mock.calls[0][1] ? JSON.stringify(templates.render.mock.calls[0][1]) : '{}') as Record<string, string>;

        it('tells the family the invoice is settled when the payment covered it', async () => {
            paidSum = '350';

            await create();

            expect(templates.render).toHaveBeenCalledWith('payment-received', expect.objectContaining({ firstName: 'Ana', month: 'martie' }));
            expect(outbox.queueOrRecord).toHaveBeenCalledWith(
                { email: 'ana@example.com' },
                expect.objectContaining({ dedupeKey: 'receipt:11' }),
                // The caller's manager, so the receipt and the payment commit together.
                manager,
            );
        });

        // E16/S6: the confirmation leaves the minute the money is entered; the fiscal documents follow
        // in SmartBill's time, and the portal is where both are whenever they arrive.
        it('points the family at the portal, where the fiscal invoice and the receipt are', async () => {
            paidSum = '350';

            await create();

            expect(rendered().portalUrl).toMatch(/\/user\/payments$/);
        });

        it('names what is left when the payment did not cover the invoice', async () => {
            paidSum = '200';

            await create({ amount: 200 });

            expect(templates.render).toHaveBeenCalledWith('payment-received-partial', expect.any(Object));
            // 350 − 200, computed once by the recomputation rather than subtracted again here.
            expect(rendered().outstanding).toBe('150 lei');
            // And the sum that arrived now, not the running total: the figure the family sent.
            expect(rendered().amount).toBe('200 lei');
        });

        it('says nothing for a payment that has not succeeded', async () => {
            await create({ status: PaymentStatus.INITIATED });

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('leaves a record rather than skipping a family with no address', async () => {
            // E17/S5: `queueOrRecord` writes an undeliverable row. The branch that must NOT exist is
            // an `if (email)` here, which would put the fact in a log nobody reads.
            invoiceInDb.parent.email = null;
            paidSum = '350';

            await create();

            expect(outbox.queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.any(Object), manager);
        });

        it('confirms an initiated payment at the moment it is marked succeeded', async () => {
            paymentInDb = {
                id: 11,
                amount: 350,
                status: PaymentStatus.INITIATED,
                date: new Date(2026, 2, 10),
                fiscalStatus: null,
                invoice: invoiceInDb,
            };
            paidSum = '350';

            await service.updatePayment(11, { status: PaymentStatus.SUCCEEDED }, ACTOR);

            expect(outbox.queueOrRecord).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ dedupeKey: 'receipt:11' }), manager);
        });

        it('does not confirm again when an already-succeeded payment is edited', async () => {
            paymentInDb = {
                id: 11,
                amount: 350,
                status: PaymentStatus.SUCCEEDED,
                date: new Date(2026, 2, 10),
                fiscalStatus: null,
                invoice: invoiceInDb,
            };
            paidSum = '350';

            await service.updatePayment(11, { externalReference: 'OP 4242' }, ACTOR);

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('says nothing when a payment is deleted', async () => {
            // A row removed by mistake is a correction, and an automated "actually we did not get
            // your money" is worse than the phone call it would replace.
            paymentInDb = { id: 11, fiscalStatus: null, invoice: invoiceInDb };
            paidSum = null;

            await service.deletePayment(11, ACTOR);

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });
    });

    /**
     * E07/S3. The story's question is "who changed invoice 412's amount and when", and the money
     * screens are where it gets asked. What these assert is not the log's shape — `audit.rules.spec`
     * owns that — but that every write here reaches it, and reaches it *with the transaction's
     * manager*: a trail that survives a rolled-back edit is worse than none.
     */
    describe('audit trail', () => {
        it('records a created payment, in the transaction that wrote it', async () => {
            paidSum = '350';

            await create({ notes: 'chitanta 12' });

            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: ACTOR,
                    action: AuditAction.CREATED,
                    entityType: 'Payment',
                    entityId: 11,
                    changes: expect.objectContaining({ amount: { from: null, to: 350 }, notes: { from: null, to: 'chitanta 12' } }),
                }),
                manager,
            );
        });

        it('records an edit as the fields that moved, read before the assignment', async () => {
            paymentInDb = {
                id: 11,
                amount: 350,
                method: PaymentMethod.CASH,
                status: PaymentStatus.SUCCEEDED,
                date: new Date(2026, 2, 10),
                externalReference: null,
                notes: null,
                fiscalStatus: null,
                invoice: invoiceInDb,
            };
            paidSum = '150';

            await service.updatePayment(11, { amount: 150 }, ACTOR);

            expect(audit.recordUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: ACTOR,
                    entityType: 'Payment',
                    entityId: 11,
                    before: expect.objectContaining({ amount: 350 }),
                    after: expect.objectContaining({ amount: 150 }),
                }),
                manager,
            );
        });

        it('keeps what a deleted row held, because nothing is left to look at afterwards', async () => {
            paymentInDb = {
                id: 11,
                amount: 350,
                method: PaymentMethod.CASH,
                status: PaymentStatus.SUCCEEDED,
                date: new Date('2026-03-10T00:00:00.000Z'),
                externalReference: null,
                notes: null,
                fiscalStatus: null,
                invoice: invoiceInDb,
            };
            paidSum = null;

            await service.deletePayment(11, ACTOR);

            expect(audit.record).toHaveBeenCalledWith(
                expect.objectContaining({
                    actor: ACTOR,
                    action: AuditAction.DELETED,
                    entityType: 'Payment',
                    entityId: 11,
                    changes: expect.objectContaining({
                        amount: { from: 350, to: null },
                        date: { from: '2026-03-10T00:00:00.000Z', to: null },
                    }),
                }),
                manager,
            );
        });
    });
});
