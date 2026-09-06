import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Payment } from 'src/entities/payment.entity';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
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

describe('PaymentService', () => {
    let service: PaymentService;
    let paymentRepo: MockRepository;
    let invoiceRepo: MockRepository;
    let manager: MockEntityManager;
    /** E16/S6. What the family was told, if anything — the receipt is queued, never sent here. */
    let outbox: { queueOrRecord: jest.Mock };
    let templates: { render: jest.Mock };

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
        parent: { id: number; firstName: string; email: string | null };
    };

    beforeEach(async () => {
        paymentRepo = createMockRepository();
        invoiceRepo = createMockRepository();
        manager = createMockEntityManager();
        paidSum = null;
        invoiceInDb = {
            id: 5,
            amount: 350,
            status: InvoiceStatus.PENDING,
            monthIssued: '2026-03',
            parent: { id: 3, firstName: 'Ana', email: 'ana@example.com' },
        };

        manager.findOne = jest.fn(() => Promise.resolve(invoiceInDb)) as never;
        manager.createQueryBuilder = jest.fn(() => {
            const qb: Record<string, jest.Mock> = {};
            for (const method of ['select', 'where', 'andWhere']) qb[method] = jest.fn(() => qb);
            qb.getRawOne = jest.fn(() => Promise.resolve({ paid: paidSum }));
            return qb;
        }) as never;
        manager.save.mockImplementation((_entity: unknown, data: Record<string, unknown>) => Promise.resolve({ id: 11, ...data }));

        outbox = { queueOrRecord: jest.fn(() => Promise.resolve({ id: 1 })) };
        // Echoes the key back as the subject so a test can assert *which* of the two receipts went,
        // without asserting the Romanian wording — that belongs to the template's own spec.
        templates = { render: jest.fn((key: string, data: Record<string, string>) => Promise.resolve({ subject: key, bodyText: JSON.stringify(data), bodyHtml: null })) };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentService,
                provideMockRepository(Payment, paymentRepo),
                provideMockRepository(Invoice, invoiceRepo),
                provideMockDataSource(manager),
                { provide: OutboxService, useValue: outbox },
                { provide: MailTemplateService, useValue: templates },
            ],
        }).compile();

        service = module.get(PaymentService);
        invoiceRepo.findOne!.mockResolvedValue(invoiceInDb);
    });

    const create = (overrides: Record<string, unknown> = {}) => service.createPayment({ invoiceId: 5, amount: 350, date: '2026-03-10', ...overrides }, 7);

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

            // `User.passwordHash` has no `select: false`, so a leftJoinAndSelect here would put the
            // hash on the wire. The join must stay a bare join plus a named addSelect.
            expect(qb.leftJoinCalls).toContain('payment.recordedBy');
            expect(qb.addSelect).toHaveBeenCalledWith(['recordedBy.id', 'recordedBy.username']);
        });
    });

    describe('updatePayment', () => {
        it('changes only the fields that were sent, and rederives', async () => {
            const payment = { id: 1, amount: 350, method: PaymentMethod.CASH, date: new Date('2026-03-01'), invoice: { id: 5 } };
            paymentRepo.findOne!.mockResolvedValue(payment);
            paidSum = '350';

            await service.updatePayment(1, { method: PaymentMethod.BANK_TRANSFER });

            expect(payment.method).toBe(PaymentMethod.BANK_TRANSFER);
            expect(payment.date).toEqual(new Date('2026-03-01'));
            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PAID });
        });

        it('marking a payment reversed takes the invoice back off paid', async () => {
            const payment = { id: 1, amount: 350, status: PaymentStatus.SUCCEEDED, invoice: { id: 5 } };
            paymentRepo.findOne!.mockResolvedValue(payment);
            invoiceInDb.status = InvoiceStatus.PAID;
            paidSum = null;

            await service.updatePayment(1, { status: PaymentStatus.REVERSED });

            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PENDING });
        });

        it('rejects a payment that does not exist', async () => {
            paymentRepo.findOne!.mockResolvedValue(null);
            await expect(service.updatePayment(99, { method: PaymentMethod.CASH })).rejects.toThrow(NotFoundException);
        });
    });

    describe('deletePayment', () => {
        it('rederives the invoice state from what remains', async () => {
            paymentRepo.findOne!.mockResolvedValue({ id: 11, invoice: { id: 5 } });
            invoiceInDb.status = InvoiceStatus.PAID;
            paidSum = null;

            await service.deletePayment(11);

            expect(manager.delete).toHaveBeenCalledWith(Payment, 11);
            expect(manager.update).toHaveBeenCalledWith(Invoice, 5, { status: InvoiceStatus.PENDING });
        });

        it('rejects a payment that does not exist', async () => {
            paymentRepo.findOne!.mockResolvedValue(null);
            await expect(service.deletePayment(99)).rejects.toThrow(NotFoundException);
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
        const rendered = () => JSON.parse(templates.render.mock.calls[0][1] ? JSON.stringify(templates.render.mock.calls[0][1]) : '{}') as Record<string, string>;

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
            paymentRepo.findOne!.mockResolvedValue({ id: 11, amount: 350, status: PaymentStatus.INITIATED, date: new Date('2026-03-10'), invoice: invoiceInDb });
            paidSum = '350';

            await service.updatePayment(11, { status: PaymentStatus.SUCCEEDED });

            expect(outbox.queueOrRecord).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ dedupeKey: 'receipt:11' }), manager);
        });

        it('does not confirm again when an already-succeeded payment is edited', async () => {
            paymentRepo.findOne!.mockResolvedValue({ id: 11, amount: 350, status: PaymentStatus.SUCCEEDED, date: new Date('2026-03-10'), invoice: invoiceInDb });
            paidSum = '350';

            await service.updatePayment(11, { externalReference: 'OP 4242' });

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });

        it('says nothing when a payment is deleted', async () => {
            // A row removed by mistake is a correction, and an automated "actually we did not get
            // your money" is worse than the phone call it would replace.
            paymentRepo.findOne!.mockResolvedValue({ id: 11, invoice: invoiceInDb });
            paidSum = null;

            await service.deletePayment(11);

            expect(outbox.queueOrRecord).not.toHaveBeenCalled();
        });
    });
});
