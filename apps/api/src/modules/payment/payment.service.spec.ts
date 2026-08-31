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

describe('PaymentService', () => {
    let service: PaymentService;
    let paymentRepo: MockRepository;
    let invoiceRepo: MockRepository;
    let manager: MockEntityManager;

    /** What the SUM(...) inside the recomputation answers, as the driver returns it: a string. */
    let paidSum: string | null;
    /** The invoice the recomputation reads back inside the transaction. */
    let invoiceInDb: { id: number; amount: number; status: InvoiceStatus };

    beforeEach(async () => {
        paymentRepo = createMockRepository();
        invoiceRepo = createMockRepository();
        manager = createMockEntityManager();
        paidSum = null;
        invoiceInDb = { id: 5, amount: 350, status: InvoiceStatus.PENDING };

        manager.findOne = jest.fn(() => Promise.resolve(invoiceInDb)) as never;
        manager.createQueryBuilder = jest.fn(() => {
            const qb: Record<string, jest.Mock> = {};
            for (const method of ['select', 'where', 'andWhere']) qb[method] = jest.fn(() => qb);
            qb.getRawOne = jest.fn(() => Promise.resolve({ paid: paidSum }));
            return qb;
        }) as never;
        manager.save.mockImplementation((_entity: unknown, data: Record<string, unknown>) => Promise.resolve({ id: 11, ...data }));

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentService,
                provideMockRepository(Payment, paymentRepo),
                provideMockRepository(Invoice, invoiceRepo),
                provideMockDataSource(manager),
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
});
