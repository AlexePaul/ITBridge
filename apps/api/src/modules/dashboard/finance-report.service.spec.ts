import { Test, TestingModule } from '@nestjs/testing';
import { FinanceReportService } from './finance-report.service';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { createMockQueryBuilder, createMockRepository, MockRepository, provideMockRepository } from 'src/testing/repository.mock';

/**
 * Invoiced against collected — E21/S2.
 *
 * The queries are stubbed; what is under test is the arithmetic that turns rows into a month, and
 * the two things the report promises: only succeeded payments are money, and the two calendars —
 * "for the month" and "in the month" — are kept apart.
 */
describe('FinanceReportService', () => {
    let service: FinanceReportService;
    let invoiceRepo: MockRepository;
    let paymentRepo: MockRepository;
    let arrears: { list: jest.Mock };

    const TODAY = new Date(2026, 3, 15);

    const invoice = (id: number, monthIssued: string, amount: number, parentId: number, status = InvoiceStatus.PENDING) =>
        ({ id, monthIssued, amount, status, parent: { id: parentId } }) as unknown as Invoice;

    /** Wires the three payment queries: the per-invoice sums, the dated rows, and the status counts. */
    const stubPayments = (
        paidPerInvoice: { invoiceId: number; paid: string }[],
        dated: Partial<Payment>[],
        counts: { status: PaymentStatus; count: string }[] = [],
    ) => {
        paymentRepo.createQueryBuilder!.mockImplementation(() => {
            const qb = createMockQueryBuilder<Payment>({ many: dated as Payment[] });
            // The same builder is handed to all three queries; which result it gives depends on how
            // the call ends. `getRawMany` is asked twice with different shapes, so it answers by the
            // grouping that was requested.
            let grouped: string | null = null;
            (qb.groupBy as jest.Mock).mockImplementation((column: string) => {
                grouped = column;
                return qb;
            });
            (qb.getRawMany as jest.Mock).mockImplementation(() => Promise.resolve(grouped === 'payment.status' ? counts : paidPerInvoice));
            return qb;
        });
    };

    beforeEach(async () => {
        invoiceRepo = createMockRepository();
        paymentRepo = createMockRepository();
        arrears = { list: jest.fn().mockResolvedValue([]) };
        invoiceRepo.createQueryBuilder!.mockImplementation(() => createMockQueryBuilder<Invoice>({ many: [] }));
        stubPayments([], []);

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                FinanceReportService,
                provideMockRepository(Invoice, invoiceRepo),
                provideMockRepository(Payment, paymentRepo),
                { provide: ArrearsService, useValue: arrears },
            ],
        }).compile();
        service = module.get(FinanceReportService);
    });

    it('gives every month in the range a row, zeros included', async () => {
        const report = await service.build('2026-01', '2026-03', TODAY);
        expect(report.months.map((row) => row.month)).toEqual(['2026-01', '2026-02', '2026-03']);
        expect(report.months[1]).toMatchObject({ invoiced: 0, invoices: 0, collectedForMonth: 0, collectedInMonth: 0, families: 0 });
        expect(report.generatedOn).toBe('2026-04-15');
    });

    it('sums billable invoices and counts waived ones separately, per month and per family', async () => {
        invoiceRepo.createQueryBuilder!.mockImplementation(() =>
            createMockQueryBuilder<Invoice>({
                many: [
                    invoice(1, '2026-03', 350, 10),
                    invoice(2, '2026-03', 600, 11),
                    invoice(3, '2026-03', 0, 12, InvoiceStatus.WAIVED),
                    invoice(4, '2026-02', 350, 10),
                ],
            }),
        );

        const report = await service.build('2026-02', '2026-03', TODAY);

        expect(report.months[1]).toMatchObject({ month: '2026-03', invoiced: 950, invoices: 2, waived: 1, families: 2, averagePerFamily: 475 });
        expect(report.months[0]).toMatchObject({ month: '2026-02', invoiced: 350, invoices: 1, families: 1 });
        // Family 10 is billed in both months and is one family across the range; family 12, whose
        // month was waived, was not billed and does not dilute the average.
        expect(report.totals).toMatchObject({ invoiced: 1300, invoices: 3, waived: 1, families: 2, averagePerFamily: 650 });
        expect(report.basis).toMatchObject({ billableInvoices: 3, waivedInvoices: 1 });
    });

    it('keeps "collected for the month" and "collected in the month" apart', async () => {
        invoiceRepo.createQueryBuilder!.mockImplementation(() =>
            createMockQueryBuilder<Invoice>({ many: [invoice(1, '2026-03', 350, 10), invoice(2, '2026-03', 600, 11)] }),
        );
        stubPayments(
            // Invoice 1 paid in full, invoice 2 paid 100 of 600 — whenever those payments landed.
            [
                { invoiceId: 1, paid: '350' },
                { invoiceId: 2, paid: '100' },
            ],
            // The 350 landed in March by transfer; the 100 arrived in April, in cash.
            [
                { id: 1, amount: 350, method: PaymentMethod.BANK_TRANSFER, date: '2026-03-10' as unknown as Date },
                { id: 2, amount: 100, method: PaymentMethod.CASH, date: '2026-04-02' as unknown as Date },
            ],
        );

        const report = await service.build('2026-03', '2026-04', TODAY);

        const march = report.months[0];
        expect(march).toMatchObject({ invoiced: 950, collectedForMonth: 450, outstanding: 500, collectedInMonth: 350 });
        expect(march.byMethod).toEqual({ cash: 0, bankTransfer: 350 });

        const april = report.months[1];
        expect(april).toMatchObject({ invoiced: 0, collectedForMonth: 0, outstanding: 0, collectedInMonth: 100 });
        expect(april.byMethod).toEqual({ cash: 100, bankTransfer: 0 });

        expect(report.totals).toMatchObject({ collectedForMonth: 450, collectedInMonth: 450, outstanding: 500 });
    });

    it('never lets an overpaid invoice show a negative balance', async () => {
        invoiceRepo.createQueryBuilder!.mockImplementation(() => createMockQueryBuilder<Invoice>({ many: [invoice(1, '2026-03', 350, 10)] }));
        stubPayments([{ invoiceId: 1, paid: '400' }], []);

        const report = await service.build('2026-03', '2026-03', TODAY);
        expect(report.months[0]).toMatchObject({ collectedForMonth: 400, outstanding: 0 });
    });

    it('asks only for succeeded payments, and reports the other states as the basis', async () => {
        stubPayments(
            [],
            [],
            [
                { status: PaymentStatus.SUCCEEDED, count: '4' },
                { status: PaymentStatus.INITIATED, count: '1' },
                { status: PaymentStatus.REVERSED, count: '2' },
            ],
        );

        const report = await service.build('2026-03', '2026-03', TODAY);

        expect(report.basis).toMatchObject({ succeededPayments: 4, initiatedPayments: 1, reversedPayments: 2, failedPayments: 0 });
        // Every payment query that produced money narrowed on the succeeded state.
        const builders = paymentRepo.createQueryBuilder!.mock.results.map((result) => result.value as ReturnType<typeof createMockQueryBuilder>);
        const narrowed = builders.filter((qb) =>
            qb.andWhereCalls.some(([condition, params]) => condition.includes('payment.status') && params?.status === PaymentStatus.SUCCEEDED),
        );
        expect(narrowed.length).toBeGreaterThanOrEqual(1);
    });

    it('takes ageing from the arrears service instead of re-deriving it', async () => {
        arrears.list.mockResolvedValue([
            { invoiceId: 1, parentId: 10, outstanding: 350, bucket: 'overdue' },
            { invoiceId: 2, parentId: 10, outstanding: 100, bucket: 'over_60' },
            { invoiceId: 3, parentId: 11, outstanding: 600, bucket: 'due_soon' },
        ]);

        const report = await service.build('2026-03', '2026-03', TODAY);

        expect(arrears.list).toHaveBeenCalledWith(TODAY);
        expect(report.arrears).toMatchObject({ families: 2, outstanding: 1050 });
        expect(report.arrears.byBucket.overdue).toEqual({ invoices: 1, outstanding: 350 });
        expect(report.arrears.byBucket.over_60).toEqual({ invoices: 1, outstanding: 100 });
        expect(report.arrears.byBucket.due_soon).toEqual({ invoices: 1, outstanding: 600 });
        expect(report.arrears.byBucket.over_30).toEqual({ invoices: 0, outstanding: 0 });
    });

    it('does not query payments per invoice when there are no invoices', async () => {
        await service.build('2026-03', '2026-03', TODAY);
        const builders = paymentRepo.createQueryBuilder!.mock.results.map((result) => result.value as ReturnType<typeof createMockQueryBuilder>);
        expect(builders.some((qb) => qb.andWhereCalls.some(([condition]) => condition.includes('IN (:...invoiceIds)')))).toBe(false);
    });
});
