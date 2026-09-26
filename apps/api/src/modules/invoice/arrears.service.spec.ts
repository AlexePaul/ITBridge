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
            qb.getRawMany = jest.fn().mockResolvedValue([{ invoiceId: 7, paid: '200', announced: '0' }]);

            const [row] = await service.list(DAY);

            expect(row.amount).toBe(350);
            expect(row.paid).toBe(200);
            expect(row.outstanding).toBe(150);
        });

        it('leaves out an invoice already covered, whatever its status column says', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice()]);
            qb.getRawMany = jest.fn().mockResolvedValue([{ invoiceId: 7, paid: '350', announced: '0' }]);

            // A family who has paid must never appear on a chasing list, even if something
            // upstream failed to move the status.
            await expect(service.list(DAY)).resolves.toEqual([]);
        });

        it('counts an announced transfer apart — it has not arrived, so the family still owes it', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice()]);
            qb.getRawMany = jest.fn().mockResolvedValue([{ invoiceId: 7, paid: '0', announced: '350' }]);

            const [row] = await service.list(DAY);

            expect(row).toMatchObject({ paid: 0, outstanding: 350, announced: 350 });
            // The sums are split by status in the query itself, succeeded apart from initiated.
            expect(qb.andWhereCalls.some(([c, p]) => c.includes('payment.status IN') && p?.succeeded === 'succeeded' && p?.initiated === 'initiated')).toBe(
                true,
            );
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

    /**
     * The review of 25 September 2026: the portal showed a family that had paid 100 of 350 the whole
     * 350 as still to pay. Every invoice the API hands out now carries what arrived and what is left,
     * from the same sum and subtraction as the list.
     */
    /**
     * The review of 25 September 2026: the early signals' retrospective check asked `list`, which
     * reads statuses as they are now and every payment ever made — so a family named in Monday's
     * digest that paid on the 20th could no longer be found by asking about Monday.
     */
    describe('as it stood on a day', () => {
        it('reads every invoice issued by then, whatever it says now, except a waived month', async () => {
            await service.asOf(new Date(2026, 2, 2));

            const where = (invoiceRepo.find!.mock.calls[0][0] as { where: { status: unknown; dateIssued: unknown } }).where;
            expect(JSON.stringify(where.status)).toContain('waived');
            expect(JSON.stringify(where.status)).toContain('"not"');
            expect(JSON.stringify(where.dateIssued)).toContain('2026-03-02');
        });

        it('counts only the payments that had arrived by then', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice({ status: InvoiceStatus.PAID, dateIssued: new Date(2026, 1, 1) })]);

            const [row] = await service.asOf(new Date(2026, 2, 2));

            expect(qb.andWhere).toHaveBeenCalledWith('payment.date <= :until', { until: '2026-03-02' });
            // No payment by then, so the invoice paid on the 20th was still owed on the 2nd.
            expect(row).toMatchObject({ invoiceId: 7, outstanding: 350 });
        });
    });

    describe('the balance on every invoice', () => {
        it('attaches what arrived and what is left, from succeeded payments only', async () => {
            // 250 announced on top: a transfer on its way is not money a family has paid.
            qb.getRawMany = jest.fn().mockResolvedValue([{ invoiceId: 7, paid: '100', announced: '250' }]);

            const [withBalance] = await service.withBalances([invoice() as unknown as Invoice]);

            expect(withBalance).toMatchObject({ id: 7, amount: 350, paid: 100, outstanding: 250 });
        });

        it('says nothing is left on a paid invoice, and never a negative figure on an overpaid one', async () => {
            qb.getRawMany = jest.fn().mockResolvedValue([{ invoiceId: 7, paid: '400', announced: '0' }]);

            const [withBalance] = await service.withBalances([invoice({ status: InvoiceStatus.PAID }) as unknown as Invoice]);

            expect(withBalance).toMatchObject({ paid: 400, outstanding: 0 });
        });

        it('owes nothing on a waived month', async () => {
            const [withBalance] = await service.withBalances([invoice({ amount: 0, status: InvoiceStatus.WAIVED }) as unknown as Invoice]);

            expect(withBalance).toMatchObject({ paid: 0, outstanding: 0 });
        });

        it('does not go looking for payments for an empty list', async () => {
            await expect(service.withBalances([])).resolves.toEqual([]);
            expect(paymentRepo.createQueryBuilder).not.toHaveBeenCalled();
        });
    });
    describe('markOverdue', () => {
        it('moves only the pending ones that are actually past the term', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice({ id: 7, dateIssued: new Date(2026, 2, 1) }), invoice({ id: 9, dateIssued: new Date(2026, 2, 18) })]);
            invoiceRepo.update!.mockResolvedValue({ affected: 1 });

            const moved = await service.markOverdue(DAY);

            expect(moved).toBe(1);
            const [criteria] = invoiceRepo.update!.mock.calls[0] as [{ id: unknown }];
            expect(JSON.stringify(criteria.id)).toContain('7');
            expect(JSON.stringify(criteria.id)).not.toContain('9');
        });

        it('writes only rows still pending, so an invoice paid since the read is not turned back', async () => {
            invoiceRepo.find!.mockResolvedValue([invoice({ id: 7, dateIssued: new Date(2026, 2, 1) })]);
            // Paid between the read and the write: the UPDATE matches nothing.
            invoiceRepo.update!.mockResolvedValue({ affected: 0 });

            const moved = await service.markOverdue(DAY);

            const [criteria] = invoiceRepo.update!.mock.calls[0] as [{ status: unknown }];
            expect(criteria.status).toBe(InvoiceStatus.PENDING);
            expect(moved).toBe(0);
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
