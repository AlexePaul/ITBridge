import { Test, TestingModule } from '@nestjs/testing';
import { ArrearsService } from './arrears.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { createMockQueryBuilder, createMockRepository, MockQueryBuilder, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

describe('ArrearsService', () => {
    let service: ArrearsService;
    let invoiceRepo: MockRepository;
    let paymentRepo: MockRepository;
    let qb: MockQueryBuilder;

    /** 20 March. An invoice issued on the 1st was due on the 15th, so five days late. */
    const DAY = new Date(2026, 2, 20);

    const invoice = (overrides: Record<string, unknown> = {}) => ({
        id: 7,
        amount: 350,
        dateIssued: new Date(2026, 2, 1),
        monthIssued: '2026-03',
        status: InvoiceStatus.PENDING,
        parent: { id: 1, firstName: 'Ana', lastName: 'Popescu', email: 'ana@example.com', phone: '0712345678' },
        ...overrides,
    });

    beforeEach(async () => {
        invoiceRepo = createMockRepository();
        paymentRepo = createMockRepository();
        qb = createMockQueryBuilder<Record<string, unknown>>({ many: [] });
        qb.getRawMany = jest.fn().mockResolvedValue([]);
        paymentRepo.createQueryBuilder!.mockReturnValue(qb);
        invoiceRepo.find!.mockResolvedValue([]);

        const module: TestingModule = await Test.createTestingModule({
            providers: [ArrearsService, provideMockRepository(Invoice, invoiceRepo), provideMockRepository(Payment, paymentRepo)],
        }).compile();
        service = module.get(ArrearsService);
    });

    describe('the list', () => {
        it('asks only for invoices that are not settled', async () => {
            await service.list(DAY);
            const where = (invoiceRepo.find!.mock.calls[0][0] as { where: { status: unknown } }).where;
            // `paid` and `waived` are excluded at the query, so an invoice leaves this list the
            // moment the payment lands — which is the "reminders stop on payment" criterion,
            // expressed as the absence of a row.
            expect(JSON.stringify(where.status)).toContain('pending');
            expect(JSON.stringify(where.status)).toContain('overdue');
            expect(JSON.stringify(where.status)).not.toContain('waived');
        });

        it('reports the outstanding amount, not the invoice total', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice()]);
            qb.getRawMany = jest.fn().mockResolvedValue([{ invoiceId: 7, paid: '200' }]);

            const [row] = await service.list(DAY);

            expect(row.amount).toBe(350);
            expect(row.paid).toBe(200);
            expect(row.outstanding).toBe(150);
        });

        it('leaves out an invoice already covered, whatever its status column says', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice()]);
            qb.getRawMany = jest.fn().mockResolvedValue([{ invoiceId: 7, paid: '350' }]);

            // A family who has paid must never appear on a chasing list, even if something
            // upstream failed to move the status.
            await expect(service.list(DAY)).resolves.toEqual([]);
        });

        it('counts only succeeded payments — an announced transfer has not arrived', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice()]);
            await service.list(DAY);
            expect(qb.andWhereCalls.some(([c, p]) => c.includes('payment.status') && p?.status === 'succeeded')).toBe(true);
        });

        it('ages the debt and sorts the oldest first', async () => {
            invoiceRepo.find!.mockResolvedValue([
                invoice({ id: 7, dateIssued: new Date(2026, 2, 1) }),
                invoice({ id: 8, dateIssued: new Date(2026, 0, 1), parent: { id: 2, firstName: 'Bogdan', lastName: 'Ion', email: null, phone: null } }),
            ]);

            const rows = await service.list(DAY);

            expect(rows[0].invoiceId).toBe(8);
            expect(rows[0].daysOverdue).toBeGreaterThan(rows[1].daysOverdue);
            // Issued 1 January, due the 15th: on 20 March that is 64 days, the band where the
            // platform has stopped writing and somebody has to pick up the phone.
            expect(rows[0].daysOverdue).toBe(64);
            expect(rows[0].bucket).toBe('over_60');
        });

        it("carries the family's phone — chasing a payment is a call, not a second screen", async () => {
            invoiceRepo.find!.mockResolvedValue([invoice()]);
            const [row] = await service.list(DAY);
            expect(row.phone).toBe('0712345678');
        });

        it('does not go looking for payments when nothing is unpaid', async () => {
            await expect(service.list(DAY)).resolves.toEqual([]);
            expect(paymentRepo.createQueryBuilder).not.toHaveBeenCalled();
        });
    });

    describe('markOverdue', () => {
        it('moves only the pending ones that are actually past the term', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice({ id: 7, dateIssued: new Date(2026, 2, 1) }), invoice({ id: 9, dateIssued: new Date(2026, 2, 18) })]);

            const moved = await service.markOverdue(DAY);

            expect(moved).toBe(1);
            const [criteria] = invoiceRepo.update!.mock.calls[0] as [{ id: unknown }];
            expect(JSON.stringify(criteria.id)).toContain('7');
            expect(JSON.stringify(criteria.id)).not.toContain('9');
        });

        it('writes nothing when nothing is late', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice({ dateIssued: new Date(2026, 2, 18) })]);
            await expect(service.markOverdue(DAY)).resolves.toBe(0);
            expect(invoiceRepo.update).not.toHaveBeenCalled();
        });

        it('asks only for pending — paid and waived are settled, overdue needs nothing said twice', async () => {
            await service.markOverdue(DAY);
            expect(invoiceRepo.find).toHaveBeenCalledWith({ where: { status: InvoiceStatus.PENDING } });
        });
    });
});
