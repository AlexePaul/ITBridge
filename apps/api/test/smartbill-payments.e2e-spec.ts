import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { FAKE_CREDENTIALS, FakeSmartBill } from './fake-smartbill';
import { FiscalIssuingService } from 'src/modules/invoice/fiscal-issuing.service';
import { PaymentFiscalService } from 'src/modules/payment/payment-fiscal.service';
import { FiscalDivergenceService } from 'src/modules/invoice/fiscal-divergence.service';
import { SmartBillService } from 'src/modules/smartbill/smartbill.service';
import { S3Service } from 'src/modules/storage/s3.service';
import { Invoice, InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { Payment, PaymentFiscalStatus } from 'src/entities/payment.entity';

/**
 * Money entered once, in the platform, reaching SmartBill by itself — E16/S5, with S6's receipt.
 *
 * Against a real database and a fake SmartBill that speaks HTTP, for the reason the issuing suite
 * gives: the cases worth testing are the ones where the network misbehaves. The acceptance is the
 * story's own: "o încasare introdusă în platformă apare în SmartBill fără intervenție. O eroare de
 * rețea la propagare nu pierde încasarea și nu o dublează la reîncercare."
 */
describe('Recording payments in SmartBill (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let issuing: FiscalIssuingService;
    let payments: PaymentFiscalService;
    let divergence: FiscalDivergenceService;
    let smartBill: SmartBillService;
    let s3: { putObject: jest.Mock; downloadFile: jest.Mock };
    const fake = new FakeSmartBill();

    const settings = {
        SMARTBILL_USERNAME: FAKE_CREDENTIALS.username,
        SMARTBILL_TOKEN: FAKE_CREDENTIALS.token,
        SMARTBILL_CIF: FAKE_CREDENTIALS.cif,
        SMARTBILL_INVOICE_SERIES: 'ITB',
        SMARTBILL_RECEIPT_SERIES: 'CH',
    };

    const MONDAYS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];

    /** One family, one child at all four October sessions, and October issued: a 350 lei invoice. */
    const issueOctober = async (): Promise<Invoice> => {
        const roomId = await createRoom(app, admin);
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        const sessions = await Promise.all(MONDAYS.map((date) => createClassSession(dataSource, group.body.id as number, { date })));
        parent = await registerUser(app, 'familia1');
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName: 'Copil', lastName: 'Test', birthDate: '2016-05-04' })
            .expect(201);
        await request(app.getHttpServer())
            .post('/enrollments')
            .set('Authorization', admin.auth)
            .send({ childId: child.body.id, groupId: group.body.id, startDate: '2026-09-01' })
            .expect(201);
        for (const session of sessions) {
            await request(app.getHttpServer())
                .put(`/attendance/session/${session}/child/${child.body.id as number}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);
        }
        await request(app.getHttpServer())
            .post('/invoices/issue')
            .set('Authorization', admin.auth)
            .send({ monthIssued: '2026-10', dateIssued: '2026-11-01' })
            .expect(201);
        const [invoice] = await dataSource.getRepository(Invoice).find({ order: { id: 'ASC' } });
        return invoice;
    };

    /** October issued and numbered in SmartBill: ITB 0041. */
    const issuedOctober = async (): Promise<Invoice> => {
        const invoice = await issueOctober();
        await issuing.drain();
        return dataSource.getRepository(Invoice).findOneByOrFail({ id: invoice.id });
    };

    const pay = async (invoice: Invoice, body: Record<string, unknown> = {}): Promise<Payment> => {
        const res = await request(app.getHttpServer())
            .post('/payments')
            .set('Authorization', admin.auth)
            .send({ invoiceId: invoice.id, amount: 350, method: 'cash', date: '2026-11-05', ...body })
            .expect(201);
        return reload(res.body.id as number);
    };

    const reload = (id: number) => dataSource.getRepository(Payment).findOneByOrFail({ id });
    const paymentRequests = () => fake.requests.filter((req) => req.path === '/payment');
    const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

    beforeAll(async () => {
        const baseUrl = await fake.start();
        Object.assign(process.env, settings, { SMARTBILL_BASE_URL: baseUrl });
        ({ app, dataSource } = await createTestApp());
        issuing = app.get(FiscalIssuingService);
        payments = app.get(PaymentFiscalService);
        divergence = app.get(FiscalDivergenceService);
        smartBill = app.get(SmartBillService);
        s3 = app.get(S3Service);
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        fake.reset();
        s3.putObject.mockClear();
        s3.downloadFile.mockReset().mockResolvedValue(Buffer.from('%PDF-'));
        (smartBill as unknown as { lockedUntil: number }).lockedUntil = 0;
        process.env.SMARTBILL_MODE = 'live';
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
    });

    afterAll(async () => {
        await app.close();
        await fake.stop();
        for (const key of [...Object.keys(settings), 'SMARTBILL_BASE_URL', 'SMARTBILL_MODE']) delete process.env[key];
    });

    describe("in 'live'", () => {
        it('records cash as a numbered receipt on the invoice, without anybody typing it twice', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            expect(payment.fiscalStatus).toBe(PaymentFiscalStatus.PENDING);

            const result = await payments.drain();

            expect(result).toMatchObject({ sent: 1, recorded: 1, stoppedBy: null });
            expect(await reload(payment.id)).toMatchObject({
                fiscalStatus: PaymentFiscalStatus.RECORDED,
                fiscalReceiptSeries: 'CH',
                fiscalReceiptNumber: '0007',
                fiscalLastError: null,
            });
            expect(fake.collections).toEqual([
                expect.objectContaining({
                    type: 'Chitanta',
                    value: 350,
                    isDraft: false,
                    invoice: { series: 'ITB', number: '0041' },
                    receipt: { series: 'CH', number: '0007' },
                }),
            ]);
            // The client comes from the invoice: a family has no CIF to match it on.
            expect(fake.collections[0].payload).toMatchObject({ useInvoiceDetails: true, isCash: true, seriesName: 'CH' });
            expect(fake.collections[0].payload).not.toHaveProperty('client');
            expect(fake.paidOn('ITB', '0041')).toBe(350);
        });

        it('records a transfer as a payment order, which SmartBill keeps without a document', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice, { method: 'bank_transfer', amount: 200, externalReference: 'OP 1234' });

            await payments.drain();

            expect(await reload(payment.id)).toMatchObject({
                fiscalStatus: PaymentFiscalStatus.RECORDED,
                fiscalReceiptSeries: null,
                fiscalReceiptNumber: null,
            });
            expect(fake.collections).toEqual([expect.objectContaining({ type: 'Ordin plata', value: 200, receipt: null })]);
            expect(fake.series.get('CH')?.nextNumber).toBe(7);
        });

        it('records two instalments as two collections that add up to the invoice', async () => {
            const invoice = await issuedOctober();
            await pay(invoice, { amount: 150 });
            await pay(invoice, { amount: 200, method: 'bank_transfer' });

            const result = await payments.drain();

            expect(result).toMatchObject({ recorded: 2, stoppedBy: null });
            expect(fake.paidOn('ITB', '0041')).toBe(350);
        });

        it('waits for the invoice to be numbered, and goes right after', async () => {
            const invoice = await issueOctober();
            const payment = await pay(invoice);

            expect(await payments.drain()).toMatchObject({ sent: 0 });
            const queue = await request(app.getHttpServer()).get('/payments/fiscal-queue').set('Authorization', admin.auth).expect(200);
            expect(queue.body).toMatchObject({ mode: 'live', missing: [], receiptSeries: 'CH', waitingForInvoice: 1, counts: { pending: 1 } });

            await issuing.drain();
            await payments.drain();

            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.RECORDED, fiscalReceiptNumber: '0007' });
        });

        it('shows the family its receipt number once SmartBill has numbered it', async () => {
            const invoice = await issuedOctober();
            await pay(invoice);
            await payments.drain();

            const res = await request(app.getHttpServer()).get('/payments').set('Authorization', parent.auth).expect(200);

            expect(res.body).toEqual([expect.objectContaining({ fiscalStatus: 'recorded', fiscalReceiptSeries: 'CH', fiscalReceiptNumber: '0007' })]);
        });
    });

    describe("outside 'live'", () => {
        it("owes nothing in 'draft': a draft invoice has no number to record against", async () => {
            process.env.SMARTBILL_MODE = 'draft';
            const invoice = await issueOctober();
            await issuing.drain();
            const payment = await pay(invoice);

            expect(payment.fiscalStatus).toBeNull();
            expect(await payments.drain()).toMatchObject({ stoppedBy: 'off' });
            expect(paymentRequests()).toHaveLength(0);
        });

        it("sends nothing in 'off'", async () => {
            process.env.SMARTBILL_MODE = 'off';
            const invoice = await issueOctober();
            const payment = await pay(invoice);

            expect(payment.fiscalStatus).toBeNull();
            expect(await payments.drain()).toMatchObject({ stoppedBy: 'off' });
            expect(fake.requests).toHaveLength(0);
        });
    });

    /** "O eroare de rețea la propagare nu pierde încasarea și nu o dublează la reîncercare." */
    describe('an answer that never came back', () => {
        it('never becomes a second receipt when SmartBill had recorded it — a person confirms the number', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            fake.failNextPayment('drop-after-issue');

            expect(await payments.drain()).toMatchObject({ sent: 1, recorded: 0, stoppedBy: 'unanswered' });
            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.UNCERTAIN, fiscalExpectedPaid: 0, fiscalExpectedNumber: 7 });

            // Still inside the lease: nothing else goes up.
            expect(await payments.drain()).toMatchObject({ stoppedBy: 'in_flight' });

            const settled = await payments.drain({ now: minutesFromNow(3) });
            expect(settled).toMatchObject({ reconciled: 1, review: 1, sent: 0 });
            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.REVIEW, fiscalExpectedNumber: 7 });
            expect(fake.collections).toHaveLength(1);

            const withoutNumber = await request(app.getHttpServer())
                .post(`/payments/${payment.id}/fiscal/confirm`)
                .set('Authorization', admin.auth)
                .send({})
                .expect(400);
            expect(withoutNumber.body.code).toBe('RECEIPT_NUMBER_REQUIRED');

            await request(app.getHttpServer())
                .post(`/payments/${payment.id}/fiscal/confirm`)
                .set('Authorization', admin.auth)
                .send({ number: '0007' })
                .expect(200);
            expect(await reload(payment.id)).toMatchObject({
                fiscalStatus: PaymentFiscalStatus.RECORDED,
                fiscalReceiptSeries: 'CH',
                fiscalReceiptNumber: '0007',
            });
            expect(fake.collections).toHaveLength(1);
        });

        it('sends it again, once, when the paid amount shows nothing was recorded', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice, { method: 'bank_transfer' });
            fake.failNextPayment('drop-before-issue');

            await payments.drain();
            expect(await payments.drain({ now: minutesFromNow(3) })).toMatchObject({ reconciled: 1, review: 0 });
            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.PENDING });

            await payments.drain({ now: minutesFromNow(30) });

            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.RECORDED });
            expect(fake.collections).toHaveLength(1);
            expect(fake.paidOn('ITB', '0041')).toBe(350);
        });

        it('does not guess when somebody else recorded money on the invoice meanwhile', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice, { amount: 200, method: 'bank_transfer' });
            fake.failNextPayment('drop-before-issue');

            await payments.drain();
            fake.collectByHand('ITB', '0041', 100);

            await payments.drain({ now: minutesFromNow(3) });

            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.REVIEW, fiscalExpectedNumber: null });
        });

        it('sends nothing past a payment whose answer was lost', async () => {
            const invoice = await issuedOctober();
            const first = await pay(invoice, { amount: 150 });
            const second = await pay(invoice, { amount: 200 });
            fake.failNextPayment('drop-after-issue');

            await payments.drain();

            expect(await reload(first.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.UNCERTAIN });
            expect(await reload(second.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.PENDING });
            expect(paymentRequests()).toHaveLength(1);
        });
    });

    describe('a refusal', () => {
        it("waits for a person with SmartBill's own sentence, and goes once they retry", async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            fake.failNextPayment('refuse');

            expect(await payments.drain()).toMatchObject({ refused: 1 });
            expect(await reload(payment.id)).toMatchObject({
                fiscalStatus: PaymentFiscalStatus.FAILED,
                fiscalLastError: 'Factura este incasata sau stornata in totalitate.',
            });

            await request(app.getHttpServer()).post(`/payments/${payment.id}/fiscal/retry`).set('Authorization', admin.auth).expect(200);
            await payments.drain();

            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.RECORDED });
        });

        it('cannot be retried into a second collection once recorded', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            await payments.drain();

            const res = await request(app.getHttpServer()).post(`/payments/${payment.id}/fiscal/retry`).set('Authorization', admin.auth).expect(409);
            expect(res.body.code).toBe('PAYMENT_FISCAL_NOT_RETRYABLE');
        });
    });

    describe('the rate limit', () => {
        it('stops at a lock-out without spending the attempt', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            fake.failNextPayment('lockout');

            expect(await payments.drain()).toMatchObject({ stoppedBy: 'throttled' });
            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.PENDING, fiscalAttempts: 0 });
            // One SmartBill, one limit: the invoices' side stops too.
            expect(await issuing.drain()).toMatchObject({ stoppedBy: 'throttled' });
        });
    });

    describe('a payment SmartBill holds', () => {
        it('keeps its sum and cannot be deleted here — it is reversed instead', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            await payments.drain();

            const edit = await request(app.getHttpServer()).put(`/payments/${payment.id}`).set('Authorization', admin.auth).send({ amount: 300 }).expect(409);
            expect(edit.body.code).toBe('PAYMENT_RECORDED_IN_SMARTBILL');
            const removal = await request(app.getHttpServer()).delete(`/payments/${payment.id}`).set('Authorization', admin.auth).expect(409);
            expect(removal.body.code).toBe('PAYMENT_RECORDED_IN_SMARTBILL');

            await request(app.getHttpServer()).put(`/payments/${payment.id}`).set('Authorization', admin.auth).send({ status: 'reversed' }).expect(200);

            expect(await reload(payment.id)).toMatchObject({ status: 'reversed', fiscalStatus: PaymentFiscalStatus.RECORDED });
            expect(await dataSource.getRepository(Invoice).findOneByOrFail({ id: invoice.id })).toMatchObject({
                status: 'pending',
                fiscalStatus: InvoiceFiscalStatus.ISSUED,
            });
        });
    });

    /**
     * E16/S8's second half: "divergențele dintre sisteme apar într-un raport, nu într-o surpriză la
     * finalul lunii". SmartBill's side is read into the invoice; the verdict is made when the report
     * is read, against the payments as they are then.
     */
    describe('the divergence report', () => {
        const report = async () => (await request(app.getHttpServer()).get('/invoices/fiscal-divergences').set('Authorization', admin.auth).expect(200)).body;

        it('stays empty while both sides tell the same story', async () => {
            const invoice = await issuedOctober();
            await pay(invoice);
            await payments.drain();

            expect(await divergence.refresh()).toMatchObject({ checked: 1, stoppedBy: null });
            expect(await report()).toMatchObject({ mode: 'live', issued: 1, unchecked: 0, rows: [] });
        });

        it('catches money entered by hand in SmartBill', async () => {
            await issuedOctober();
            fake.collectByHand('ITB', '0041', 100);

            await divergence.refresh();

            expect((await report()).rows).toEqual([
                expect.objectContaining({ fiscalNumber: '0041', smartbillPaid: 100, recordedPaid: 0, platformPaid: 0, reasons: ['changed_in_smartbill'] }),
            ]);
        });

        it('points at a payment reversed here that is still a collection there', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            await payments.drain();
            await request(app.getHttpServer()).put(`/payments/${payment.id}`).set('Authorization', admin.auth).send({ status: 'reversed' }).expect(200);

            await divergence.refresh();

            expect((await report()).rows).toEqual([expect.objectContaining({ platformPaid: 0, smartbillPaid: 350, reasons: ['reversed_still_recorded'] })]);
        });

        it('names money SmartBill refused', async () => {
            const invoice = await issuedOctober();
            await pay(invoice);
            fake.failNextPayment('refuse');
            await payments.drain();

            await divergence.refresh();

            expect((await report()).rows).toEqual([expect.objectContaining({ platformPaid: 350, smartbillPaid: 0, reasons: ['not_recorded'] })]);
        });

        it('says when SmartBill no longer has the invoice, or has another total', async () => {
            await issuedOctober();
            fake.retotalInvoice('ITB', '0041', 300);
            await divergence.refresh();
            expect((await report()).rows).toEqual([expect.objectContaining({ smartbillTotal: 300, reasons: ['total_differs'] })]);

            fake.forgetInvoice('ITB', '0041');
            await request(app.getHttpServer()).post('/invoices/fiscal-divergences/refresh').set('Authorization', admin.auth).expect(200);
            await divergence.refresh();
            expect((await report()).rows).toEqual([expect.objectContaining({ smartbillTotal: null, reasons: ['missing_in_smartbill'] })]);
        });

        // A figure read before a payment went through would be a false alarm, so recording one clears
        // the invoice's check and it is not judged until it is read again.
        it('does not judge an invoice whose SmartBill side changed since it was read', async () => {
            const invoice = await issuedOctober();
            await divergence.refresh();
            await pay(invoice);
            await payments.drain();

            expect(await report()).toMatchObject({ issued: 1, unchecked: 1, rows: [] });

            await divergence.refresh();
            expect(await report()).toMatchObject({ unchecked: 0, rows: [] });
        });

        it("reads nothing outside 'live'", async () => {
            await issuedOctober();
            process.env.SMARTBILL_MODE = 'off';

            expect(await divergence.refresh()).toMatchObject({ checked: 0, stoppedBy: 'off' });
        });
    });
    describe('a payment that stopped being money while its answer was out', () => {
        it('is not sent again once the lost answer is settled', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            fake.failNextPayment('drop-before-issue');
            await payments.drain();
            expect((await reload(payment.id)).fiscalStatus).toBe(PaymentFiscalStatus.UNCERTAIN);

            // The transfer bounced, and the office says so while the answer is still out.
            await request(app.getHttpServer()).put(`/payments/${payment.id}`).set('Authorization', admin.auth).send({ status: 'reversed' }).expect(200);
            await payments.drain({ now: minutesFromNow(3) });
            await payments.drain({ now: minutesFromNow(30) });

            expect((await reload(payment.id)).fiscalStatus).toBeNull();
            expect(fake.collections).toHaveLength(0);
        });

        it('leaves the queue when a person sends it again from review, instead of being recorded', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice, { amount: 100 });
            fake.failNextPayment('drop-before-issue');
            await payments.drain();
            // Somebody records money by hand in SmartBill meanwhile, so the paid amount moved: the lost
            // answer goes to a person rather than being judged.
            fake.collectByHand(invoice.fiscalSeries as string, invoice.fiscalNumber as string, 50);
            await payments.drain({ now: minutesFromNow(3) });
            expect((await reload(payment.id)).fiscalStatus).toBe(PaymentFiscalStatus.REVIEW);

            // The transfer bounced. The person finds nothing of it in SmartBill and presses "send again".
            await request(app.getHttpServer()).put(`/payments/${payment.id}`).set('Authorization', admin.auth).send({ status: 'reversed' }).expect(200);
            await request(app.getHttpServer()).post(`/payments/${payment.id}/fiscal/retry`).set('Authorization', admin.auth).expect(200);
            await payments.drain({ now: minutesFromNow(30) });

            expect((await reload(payment.id)).fiscalStatus).toBeNull();
            expect(paymentRequests()).toHaveLength(1);
        });
    });

    describe('an invoice SmartBill no longer knows, while an answer is out', () => {
        it('hands that payment to a person, and the queue goes on with the rest', async () => {
            const invoice = await issuedOctober();
            const first = await pay(invoice, { amount: 100 });
            fake.failNextPayment('drop-before-issue');
            await payments.drain();
            const second = await pay(invoice, { amount: 100 });
            // Deleted by hand in SmartBill Cloud before the lost answer was settled.
            fake.forgetInvoice(invoice.fiscalSeries as string, invoice.fiscalNumber as string);

            const result = await payments.drain({ now: minutesFromNow(3) });

            expect(result.review).toBe(1);
            expect((await reload(first.id)).fiscalStatus).toBe(PaymentFiscalStatus.REVIEW);
            // Before, the pass stopped at the first one, on every tick, and this one never moved.
            expect((await reload(second.id)).fiscalStatus).toBe(PaymentFiscalStatus.FAILED);
        });
    });

    describe('an answer whose body never arrives', () => {
        it('is not a recorded receipt: the paid amount decides, and a person confirms the number', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            fake.failNextPayment('empty-after-issue');

            await payments.drain();
            expect(await reload(payment.id)).toMatchObject({ fiscalStatus: PaymentFiscalStatus.UNCERTAIN, fiscalReceiptNumber: null });

            await payments.drain({ now: minutesFromNow(3) });

            expect((await reload(payment.id)).fiscalStatus).toBe(PaymentFiscalStatus.REVIEW);
            expect(fake.collections).toHaveLength(1);
        });
    });

    describe('the divergence check, racing a payment', () => {
        it('does not put back a check the payment cleared, with the figure from before it', async () => {
            const invoice = await issuedOctober();
            const payment = await pay(invoice);
            // The read is in the air when the payment queue records the collection and clears the check.
            fake.onNextRequest('/invoice/paymentstatus', async () => {
                await dataSource.getRepository(Payment).update(payment.id, { fiscalRecordedAt: new Date() });
                await dataSource.getRepository(Invoice).update(invoice.id, { fiscalCheckedAt: null });
            });

            await divergence.refresh();

            expect((await dataSource.getRepository(Invoice).findOneByOrFail({ id: invoice.id })).fiscalCheckedAt).toBeNull();
        });
    });
});
