import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Payment } from 'src/entities/payment.entity';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { createMockQueryBuilder, createMockRepository, isScopedToUser, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('PaymentService', () => {
    let service: PaymentService;
    let paymentRepo: MockRepository;
    let invoiceRepo: MockRepository;
    let profileRepo: MockRepository;

    beforeEach(async () => {
        paymentRepo = createMockRepository();
        invoiceRepo = createMockRepository();
        profileRepo = createMockRepository();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentService,
                provideMockRepository(Payment, paymentRepo),
                provideMockRepository(Invoice, invoiceRepo),
                provideMockRepository(Profile, profileRepo),
            ],
        }).compile();

        service = module.get(PaymentService);
    });

    describe('createPayment', () => {
        it('marks the invoice as paid and links it to the payment', async () => {
            const invoice = { id: 5, status: InvoiceStatus.PENDING, payment: null };
            const saved = { id: 11 };
            invoiceRepo.findOne!.mockResolvedValue(invoice);
            paymentRepo.create!.mockReturnValue({});
            paymentRepo.save!.mockResolvedValue(saved);
            invoiceRepo.save!.mockResolvedValue(invoice);

            await expect(service.createPayment({ invoiceId: 5, date: '2026-03-10' })).resolves.toBe(saved);

            expect(invoice.status).toBe(InvoiceStatus.PAID);
            expect(invoice.payment).toBe(saved);
            expect(invoiceRepo.save).toHaveBeenCalledWith(invoice);
        });

        it("defaults to 'cash' when the method is missing", async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 5, status: InvoiceStatus.PENDING });
            paymentRepo.create!.mockReturnValue({});
            paymentRepo.save!.mockResolvedValue({ id: 11 });

            await service.createPayment({ invoiceId: 5, date: '2026-03-10' });

            expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ method: 'cash' }));
        });

        it('rejects a non-existent invoice without saving anything', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);

            await expect(service.createPayment({ invoiceId: 99, date: '2026-03-10' })).rejects.toThrow(NotFoundException);
            expect(paymentRepo.save).not.toHaveBeenCalled();
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
    });

    describe('updatePayment', () => {
        it('changes only the fields that were sent', async () => {
            const payment = { id: 1, method: 'cash', date: new Date('2026-03-01') };
            paymentRepo.findOne!.mockResolvedValue(payment);
            paymentRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await service.updatePayment(1, { method: 'card' });

            expect(payment.method).toBe('card');
            expect(payment.date).toEqual(new Date('2026-03-01'));
        });

        it('accepts clearing the method, because it checks `undefined` rather than falsiness', async () => {
            const payment = { id: 1, method: 'cash', date: new Date('2026-03-01') };
            paymentRepo.findOne!.mockResolvedValue(payment);
            paymentRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await service.updatePayment(1, { method: '' });

            expect(payment.method).toBe('');
        });

        it('rejects a payment that does not exist', async () => {
            paymentRepo.findOne!.mockResolvedValue(null);
            await expect(service.updatePayment(99, { method: 'card' })).rejects.toThrow(NotFoundException);
        });
    });

    describe('deletePayment', () => {
        it('unlinks the payment from its invoice before deleting it', async () => {
            const invoice = { id: 5, payment: { id: 11 } };
            paymentRepo.findOne!.mockResolvedValue({ id: 11, invoice });

            await service.deletePayment(11);

            expect(invoice.payment).toBeNull();
            expect(invoiceRepo.save).toHaveBeenCalledWith(invoice);
            expect(paymentRepo.delete).toHaveBeenCalledWith(11);
        });

        it('rejects a payment that does not exist', async () => {
            paymentRepo.findOne!.mockResolvedValue(null);
            await expect(service.deletePayment(99)).rejects.toThrow(NotFoundException);
        });
    });
});
