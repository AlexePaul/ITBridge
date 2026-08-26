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
        it('marchează factura ca plătită și o leagă de plată', async () => {
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

        it("foloseşte 'cash' când metoda lipsește", async () => {
            invoiceRepo.findOne!.mockResolvedValue({ id: 5, status: InvoiceStatus.PENDING });
            paymentRepo.create!.mockReturnValue({});
            paymentRepo.save!.mockResolvedValue({ id: 11 });

            await service.createPayment({ invoiceId: 5, date: '2026-03-10' });

            expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ method: 'cash' }));
        });

        it('respinge o factură inexistentă fără să salveze nimic', async () => {
            invoiceRepo.findOne!.mockResolvedValue(null);

            await expect(service.createPayment({ invoiceId: 99, date: '2026-03-10' })).rejects.toThrow(NotFoundException);
            expect(paymentRepo.save).not.toHaveBeenCalled();
        });
    });

    describe('autorizare pe date', () => {
        it('findPayments nu restrânge nimic pentru ADMIN', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.ADMIN, 42);

            expect(isScopedToUser(qb, 42)).toBe(false);
        });

        it('findPayments restrânge la utilizatorul autentificat pentru PARENT', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne restrânge la utilizatorul autentificat pentru PARENT', async () => {
            const qb = createMockQueryBuilder({ one: { id: 1 } });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findOne(1, Role.PARENT, 42);

            expect(isScopedToUser(qb, 42)).toBe(true);
        });

        it('findOne aruncă NotFound când plata e a altui părinte', async () => {
            const qb = createMockQueryBuilder({ one: null });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await expect(service.findOne(1, Role.PARENT, 42)).rejects.toThrow(NotFoundException);
        });

        // Bug: în `findPayments`, blocul care restrânge la utilizator apare de două ori, deci
        // aceleaşi `leftJoin('parent.user', 'user')` și `andWhere('user.id = ...')` sunt adăugate
        // dublu. TypeORM refuză un alias duplicat la execuție. Testul descrie forma corectă și e
        // marcat `.failing` cât timp duplicarea există — devine roșu când cineva o scoate.
        it.failing('nu ar trebui să adauge restrângerea de două ori', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.PARENT, 42);

            expect(qb.leftJoinCalls.filter((r) => r === 'parent.user')).toHaveLength(1);
        });

        it('documentează duplicarea actuală din findPayments', async () => {
            const qb = createMockQueryBuilder({ many: [] });
            paymentRepo.createQueryBuilder!.mockReturnValue(qb);

            await service.findPayments({}, Role.PARENT, 42);

            expect(qb.leftJoinCalls.filter((r) => r === 'parent.user')).toHaveLength(2);
        });
    });

    describe('updatePayment', () => {
        it('schimbă doar câmpurile trimise', async () => {
            const payment = { id: 1, method: 'cash', date: new Date('2026-03-01') };
            paymentRepo.findOne!.mockResolvedValue(payment);
            paymentRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await service.updatePayment(1, { method: 'card' });

            expect(payment.method).toBe('card');
            expect(payment.date).toEqual(new Date('2026-03-01'));
        });

        it('acceptă golirea metodei, fiindcă verifică `undefined`, nu falsitatea', async () => {
            const payment = { id: 1, method: 'cash', date: new Date('2026-03-01') };
            paymentRepo.findOne!.mockResolvedValue(payment);
            paymentRepo.save!.mockImplementation((p: unknown) => Promise.resolve(p));

            await service.updatePayment(1, { method: '' });

            expect(payment.method).toBe('');
        });

        it('respinge o plată inexistentă', async () => {
            paymentRepo.findOne!.mockResolvedValue(null);
            await expect(service.updatePayment(99, { method: 'card' })).rejects.toThrow(NotFoundException);
        });
    });

    describe('deletePayment', () => {
        it('dezleagă plata de factură înainte să o șteargă', async () => {
            const invoice = { id: 5, payment: { id: 11 } };
            paymentRepo.findOne!.mockResolvedValue({ id: 11, invoice });

            await service.deletePayment(11);

            expect(invoice.payment).toBeNull();
            expect(invoiceRepo.save).toHaveBeenCalledWith(invoice);
            expect(paymentRepo.delete).toHaveBeenCalledWith(11);
        });

        it('respinge o plată inexistentă', async () => {
            paymentRepo.findOne!.mockResolvedValue(null);
            await expect(service.deletePayment(99)).rejects.toThrow(NotFoundException);
        });
    });
});
