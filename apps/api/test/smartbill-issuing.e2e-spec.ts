import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { FAKE_CREDENTIALS, FakeSmartBill } from './fake-smartbill';
import { FiscalIssuingService } from 'src/modules/invoice/fiscal-issuing.service';
import { SmartBillService } from 'src/modules/smartbill/smartbill.service';
import * as smartBillSettings from 'src/modules/smartbill/smartbill.config';
import { ObjectNotFoundError, S3Service } from 'src/modules/storage/s3.service';
import { PdfService } from 'src/modules/invoice/pdf.service';
import { Invoice, InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { FISCAL_LEASE_MS } from 'src/modules/invoice/fiscal-issuing.rules';

/**
 * Issuing through SmartBill — E16/S2 and S3 — against a real database and a fake SmartBill that
 * speaks HTTP, because the cases that matter are the ones where the network misbehaves: a stubbed
 * `fetch` cannot lose an answer after the invoice was written.
 *
 * SmartBill has no sandbox, so this suite is where the queue's promises are held: an answer lost
 * after the invoice was issued never becomes a second invoice, a lock-out stops everything, a
 * refusal waits for a person, and `off` sends nothing at all.
 */
describe('Issuing invoices through SmartBill (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let fiscal: FiscalIssuingService;
    let smartBill: SmartBillService;
    let s3: { putObject: jest.Mock; downloadFile: jest.Mock };
    let pdf: { generateInvoicePdf: jest.Mock };
    const fake = new FakeSmartBill();
    const familySeq = { n: 0 };

    const settings = {
        SMARTBILL_USERNAME: FAKE_CREDENTIALS.username,
        SMARTBILL_TOKEN: FAKE_CREDENTIALS.token,
        SMARTBILL_CIF: FAKE_CREDENTIALS.cif,
        SMARTBILL_INVOICE_SERIES: 'ITB',
    };

    const MONDAYS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];

    /** One family with one child, present at all four October sessions: 350 lei. */
    const family = async (groupId: number, sessionIds: number[]): Promise<void> => {
        familySeq.n += 1;
        const parent = await registerUser(app, `familia${familySeq.n}`);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName: `Copil${familySeq.n}`, lastName: 'Test', birthDate: '2016-05-04' })
            .expect(201);
        await request(app.getHttpServer())
            .post('/enrollments')
            .set('Authorization', admin.auth)
            .send({ childId: child.body.id, groupId, startDate: '2026-09-01' })
            .expect(201);
        for (const sessionId of sessionIds) {
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${child.body.id as number}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);
        }
    };

    /** Issues October for `families` families and returns their invoices, in id order. */
    const issueOctober = async (families = 1): Promise<Invoice[]> => {
        const roomId = await createRoom(app, admin);
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        const sessions = await Promise.all(MONDAYS.map((date) => createClassSession(dataSource, group.body.id as number, { date })));
        for (let i = 0; i < families; i++) await family(group.body.id as number, sessions);

        await request(app.getHttpServer())
            .post('/invoices/issue')
            .set('Authorization', admin.auth)
            .send({ monthIssued: '2026-10', dateIssued: '2026-11-01' })
            .expect(201);
        return dataSource.getRepository(Invoice).find({ order: { id: 'ASC' } });
    };

    const reload = (id: number) => dataSource.getRepository(Invoice).findOneByOrFail({ id });
    const invoiceRequests = () => fake.requests.filter((req) => req.path === '/invoice/v2');
    const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60_000);

    beforeAll(async () => {
        const baseUrl = await fake.start();
        Object.assign(process.env, settings, { SMARTBILL_BASE_URL: baseUrl });
        ({ app, dataSource } = await createTestApp());
        fiscal = app.get(FiscalIssuingService);
        smartBill = app.get(SmartBillService);
        s3 = app.get(S3Service);
        pdf = app.get(PdfService);
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        fake.reset();
        familySeq.n = 0;
        s3.putObject.mockClear();
        s3.downloadFile.mockReset().mockResolvedValue(Buffer.from('%PDF-'));
        pdf.generateInvoicePdf.mockClear();
        // The lock-out is the service's own memory; one test's ten minutes must not be the next one's.
        (smartBill as unknown as { lockedUntil: number }).lockedUntil = 0;
        process.env.SMARTBILL_MODE = 'live';
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
    });

    afterAll(async () => {
        await app.close();
        await fake.stop();
        for (const key of [...Object.keys(settings), 'SMARTBILL_BASE_URL', 'SMARTBILL_MODE']) delete process.env[key];
    });

    describe("in 'off'", () => {
        it('issues as before SmartBill — the local PDF, nothing queued, not one request out', async () => {
            process.env.SMARTBILL_MODE = 'off';
            const [invoice] = await issueOctober();

            const result = await fiscal.drain();

            expect(invoice.fiscalStatus).toBeNull();
            expect(result.stoppedBy).toBe('off');
            expect(fake.requests).toHaveLength(0);
            // E15/S6: drawn on the first download, not while issuing.
            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();
            s3.downloadFile.mockRejectedValueOnce(new ObjectNotFoundError(`invoices/2026-10/${invoice.id}.pdf`));
            await request(app.getHttpServer()).get(`/invoices/${invoice.id}/pdf`).set('Authorization', admin.auth).expect(200);
            expect(pdf.generateInvoicePdf).toHaveBeenCalledTimes(1);
        });
    });

    describe("in 'live'", () => {
        it('issues the invoice in SmartBill and keeps the series, the number and its PDF', async () => {
            const [invoice] = await issueOctober();
            expect(invoice.fiscalStatus).toBe(InvoiceFiscalStatus.PENDING);
            // E15/S7: no second document with no series and no number.
            expect(pdf.generateInvoicePdf).not.toHaveBeenCalled();

            const result = await fiscal.drain();

            expect(result).toMatchObject({ sent: 1, issued: 1, stoppedBy: null });
            const issued = await reload(invoice.id);
            expect(issued).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.ISSUED, fiscalSeries: 'ITB', fiscalNumber: '0041', fiscalLastError: null });
            expect(issued.fiscalViewUrl).toContain('/documente/extern/');
            expect(fake.issued).toHaveLength(1);
            expect(s3.putObject).toHaveBeenCalledWith(
                expect.objectContaining({ key: `invoices/2026-10/${invoice.id}.pdf`, body: Buffer.from('%PDF-1.4 fiscal ITB 0041') }),
            );
        });

        it('sends the amount the platform computed, the name and the address — and no e-mail or phone', async () => {
            const [invoice] = await issueOctober();
            await fiscal.drain();

            const payload = fake.issued[0].payload as { client: Record<string, unknown>; products: { price: number }[]; isDraft: boolean };
            expect(payload.isDraft).toBe(false);
            expect(payload.products[0].price).toBe(invoice.amount);
            expect(payload.client).toEqual({
                name: 'Test familia1',
                country: 'Romania',
                address: 'Str. Exemplu 1, București',
                isTaxPayer: false,
                saveToDb: false,
            });
        });

        it("hands the family SmartBill's PDF when it was not kept yet", async () => {
            const [invoice] = await issueOctober();
            await fiscal.drain();
            s3.downloadFile.mockRejectedValueOnce(new ObjectNotFoundError(`invoices/2026-10/${invoice.id}.pdf`));

            const res = await request(app.getHttpServer()).get(`/invoices/${invoice.id}/pdf`).set('Authorization', admin.auth).expect(200);

            expect(Buffer.from(res.body as Buffer).toString()).toBe('%PDF-1.4 fiscal ITB 0041');
        });

        it('says the fiscal invoice is not issued yet while it is still queued', async () => {
            const [invoice] = await issueOctober();
            s3.downloadFile.mockRejectedValueOnce(new ObjectNotFoundError(`invoices/2026-10/${invoice.id}.pdf`));

            const res = await request(app.getHttpServer()).get(`/invoices/${invoice.id}/pdf`).set('Authorization', admin.auth).expect(404);
            expect(res.body.code).toBe('FISCAL_INVOICE_NOT_ISSUED_YET');
        });
    });

    describe("in 'draft'", () => {
        it('sends a draft, which takes no number and leaves the series where it was', async () => {
            process.env.SMARTBILL_MODE = 'draft';
            const [invoice] = await issueOctober();

            await fiscal.drain();

            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.DRAFT, fiscalNumber: null });
            expect(fake.documents).toEqual([expect.objectContaining({ isDraft: true, number: null })]);
            expect(fake.series.get('ITB')?.nextNumber).toBe(41);
            // A draft is not an invoice: the family still reads the platform's own PDF, drawn on the
            // first download (E15/S6).
            s3.downloadFile.mockRejectedValueOnce(new ObjectNotFoundError(`invoices/2026-10/${invoice.id}.pdf`));
            await request(app.getHttpServer()).get(`/invoices/${invoice.id}/pdf`).set('Authorization', admin.auth).expect(200);
            expect(pdf.generateInvoicePdf).toHaveBeenCalledTimes(1);
        });
    });

    /**
     * The acceptance of E16/S2: "o eroare de rețea la mijlocul emiterii nu produce nici factură
     * fantomă în platformă, nici document dublu în SmartBill".
     */
    // Boot refuses `live` outside production; this is a backend that got there anyway. The rule is
    // stubbed rather than `NODE_ENV` flipped: under any other value every timer that is off under
    // jest would wake mid-suite.
    describe('a backend that is not production', () => {
        let notProduction: jest.SpyInstance;

        beforeEach(() => {
            notProduction = jest.spyOn(smartBillSettings, 'mayIssueFiscalDocuments').mockReturnValue(false);
        });

        afterEach(() => notProduction.mockRestore());

        it("claims nothing in 'live', and tells the office why", async () => {
            const [invoice] = await issueOctober();

            const result = await fiscal.drain();

            expect(result.stoppedBy).toBe('configuration');
            expect(fake.requests).toHaveLength(0);
            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.PENDING, fiscalAttempts: 0 });
            const queue = await request(app.getHttpServer()).get('/invoices/fiscal-queue').set('Authorization', admin.auth).expect(200);
            expect(queue.body.missing).toEqual(['NODE_ENV=production']);
        });

        it("still sends drafts in 'draft'", async () => {
            process.env.SMARTBILL_MODE = 'draft';
            const [invoice] = await issueOctober();

            const result = await fiscal.drain();

            expect(result).toMatchObject({ drafts: 1, stoppedBy: null });
            expect(fake.documents).toHaveLength(1);
            expect(fake.issued).toHaveLength(0);
            expect((await reload(invoice.id)).fiscalStatus).toBe(InvoiceFiscalStatus.DRAFT);
            const queue = await request(app.getHttpServer()).get('/invoices/fiscal-queue').set('Authorization', admin.auth).expect(200);
            expect(queue.body.missing).toEqual([]);
        });
    });

    describe('an answer that never came back', () => {
        it('never becomes a second invoice when SmartBill had issued it — a person confirms the number', async () => {
            const [invoice] = await issueOctober();
            fake.failNext('drop-after-issue');

            expect((await fiscal.drain()).stoppedBy).toBe('unanswered');
            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.UNCERTAIN, fiscalExpectedNumber: 41 });

            // While the lease holds, nothing at all is sent: its answer decides what the series means.
            expect((await fiscal.drain()).stoppedBy).toBe('in_flight');
            expect(invoiceRequests()).toHaveLength(1);

            const later = await fiscal.drain({ now: minutesFromNow(3) });
            expect(later.review).toBe(1);
            const review = await reload(invoice.id);
            expect(review.fiscalStatus).toBe(InvoiceFiscalStatus.REVIEW);
            expect(review.fiscalLastError).toContain('numărul 41');
            expect(fake.issued).toHaveLength(1);

            // Nothing more is sent for it, however many passes run.
            await fiscal.drain({ now: minutesFromNow(60) });
            expect(invoiceRequests()).toHaveLength(1);

            const confirmed = await request(app.getHttpServer())
                .post(`/invoices/${invoice.id}/fiscal/confirm`)
                .set('Authorization', admin.auth)
                .send({ number: '0041' })
                .expect(200);
            expect(confirmed.body).toMatchObject({ fiscalStatus: 'issued', fiscalSeries: 'ITB', fiscalNumber: '0041' });

            const trail = await request(app.getHttpServer())
                .get(`/audit?entityType=Invoice&entityId=${invoice.id}`)
                .set('Authorization', admin.auth)
                .expect(200);
            expect(JSON.stringify(trail.body)).toContain('ITB 0041');
        });

        it('sends it again, once, when the series shows nothing was issued', async () => {
            const [invoice] = await issueOctober();
            fake.failNext('drop-before-issue');

            await fiscal.drain();
            await fiscal.drain({ now: minutesFromNow(3) });
            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.PENDING, fiscalExpectedNumber: null });

            await fiscal.drain({ now: minutesFromNow(10) });

            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.ISSUED, fiscalNumber: '0041' });
            expect(fake.issued).toHaveLength(1);
        });

        // Why the series has to be the platform's own: one typed by hand makes the number a guess.
        it('does not guess a number when somebody else issued on the series meanwhile', async () => {
            const [invoice] = await issueOctober();
            fake.failNext('drop-after-issue');
            await fiscal.drain();
            fake.issueByHand('ITB');

            await fiscal.drain({ now: minutesFromNow(3) });

            const review = await reload(invoice.id);
            expect(review.fiscalStatus).toBe(InvoiceFiscalStatus.REVIEW);
            expect(review.fiscalLastError).toContain('nu se poate deduce');
        });

        it('lets a person say it is not there, and then sends it', async () => {
            const [invoice] = await issueOctober();
            fake.failNext('drop-after-issue');
            await fiscal.drain();
            await fiscal.drain({ now: minutesFromNow(3) });
            // Suppose the office looked and deleted the document in SmartBill before answering.
            fake.documents.length = 0;

            await request(app.getHttpServer()).post(`/invoices/${invoice.id}/fiscal/retry`).set('Authorization', admin.auth).expect(200);
            await fiscal.drain({ now: minutesFromNow(4) });

            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.ISSUED });
        });
    });

    describe('a refusal', () => {
        it('waits for a person with SmartBill’s own sentence, and goes once they retry', async () => {
            const [invoice] = await issueOctober();
            fake.failNext('refuse');

            const result = await fiscal.drain();

            expect(result.refused).toBe(1);
            const failed = await reload(invoice.id);
            expect(failed.fiscalStatus).toBe(InvoiceFiscalStatus.FAILED);
            expect(failed.fiscalLastError).toBe('Cota tva a produsului Servicii nu a fost gasita pe server!');
            expect(fake.issued).toHaveLength(0);

            await request(app.getHttpServer()).post(`/invoices/${invoice.id}/fiscal/retry`).set('Authorization', admin.auth).expect(200);
            await fiscal.drain();

            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.ISSUED, fiscalNumber: '0041' });
        });

        it('cannot be retried into a second document once issued', async () => {
            const [invoice] = await issueOctober();
            await fiscal.drain();

            const res = await request(app.getHttpServer()).post(`/invoices/${invoice.id}/fiscal/retry`).set('Authorization', admin.auth).expect(409);
            expect(res.body.code).toBe('FISCAL_NOT_RETRYABLE');
        });
    });

    describe('the rate limit', () => {
        it('stops the whole queue at a lock-out, without spending the attempt', async () => {
            const invoices = await issueOctober(2);
            fake.failNext('lockout');

            const result = await fiscal.drain();

            expect(result.stoppedBy).toBe('throttled');
            expect(invoiceRequests()).toHaveLength(1);
            for (const invoice of invoices) {
                expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.PENDING, fiscalAttempts: 0 });
            }

            // Nothing is sent during the ten minutes, not even a read.
            const before = fake.requests.length;
            expect((await fiscal.drain({ now: minutesFromNow(5) })).stoppedBy).toBe('throttled');
            expect(fake.requests).toHaveLength(before);

            const queue = await request(app.getHttpServer()).get('/invoices/fiscal-queue').set('Authorization', admin.auth).expect(200);
            expect(queue.body).toMatchObject({ mode: 'live', counts: { pending: 2 } });
            expect(queue.body.lockedUntil).not.toBeNull();
        });
    });

    describe('a token SmartBill does not accept', () => {
        it('keeps the invoice waiting with its attempt, and says why', async () => {
            const [invoice] = await issueOctober();
            fake.failNext('unauthorised');

            const result = await fiscal.drain();

            expect(result.stoppedBy).toBe('configuration');
            const waiting = await reload(invoice.id);
            expect(waiting).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.PENDING, fiscalAttempts: 0 });
            expect(waiting.fiscalLastError).toContain('Autentificare esuata');
        });
    });

    describe('an invoice with a fiscal document', () => {
        it('cannot have its amount changed, or be deleted, here — only a storno in SmartBill undoes it', async () => {
            const [invoice] = await issueOctober();
            await fiscal.drain();

            const edit = await request(app.getHttpServer()).put(`/invoices/${invoice.id}`).set('Authorization', admin.auth).send({ amount: 1 }).expect(409);
            expect(edit.body.code).toBe('INVOICE_HAS_FISCAL_DOCUMENT');
            const remove = await request(app.getHttpServer()).delete(`/invoices/${invoice.id}`).set('Authorization', admin.auth).expect(409);
            expect(remove.body.code).toBe('INVOICE_HAS_FISCAL_DOCUMENT');
        });

        it('keeps its fiscal reference through an edit of the status', async () => {
            const [invoice] = await issueOctober();
            await fiscal.drain();

            await request(app.getHttpServer()).put(`/invoices/${invoice.id}`).set('Authorization', admin.auth).send({ status: 'paid' }).expect(200);

            expect(await reload(invoice.id)).toMatchObject({ status: 'paid', fiscalStatus: InvoiceFiscalStatus.ISSUED, fiscalNumber: '0041' });
        });
    });

    describe('many families at once — S3', () => {
        it('issues them one after another on consecutive numbers, and reports the one refused on its own row', async () => {
            const invoices = await issueOctober(3);
            fake.failNext('none', 'refuse');

            const result = await fiscal.drain();

            expect(result).toMatchObject({ sent: 3, issued: 2, refused: 1 });
            const rows = await Promise.all(invoices.map((invoice) => reload(invoice.id)));
            expect(rows.map((row) => row.fiscalStatus)).toEqual([InvoiceFiscalStatus.ISSUED, InvoiceFiscalStatus.FAILED, InvoiceFiscalStatus.ISSUED]);
            expect(rows.map((row) => row.fiscalNumber)).toEqual(['0041', null, '0042']);
            // One series read for the pass, one request per invoice, one PDF per issued one.
            expect(fake.requests.filter((req) => req.path === '/series')).toHaveLength(1);
        });
    });
    describe('an answer whose body never arrives', () => {
        it('is not an issued invoice: the series decides, and a person confirms the number', async () => {
            const [invoice] = await issueOctober();
            fake.failNext('empty-after-issue');

            const first = await fiscal.drain();

            // The 200 came, the body did not: an invoice may exist under a number nobody saw.
            expect(first.stoppedBy).toBe('unanswered');
            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.UNCERTAIN, fiscalNumber: null });

            const later = await fiscal.drain({ now: minutesFromNow(3) });

            expect(later.review).toBe(1);
            expect(await reload(invoice.id)).toMatchObject({ fiscalStatus: InvoiceFiscalStatus.REVIEW });
            expect(fake.issued).toHaveLength(1);
        });
    });

    describe('the lease', () => {
        it('counts from when the request goes out, not from when the pass began', async () => {
            await issueOctober(3);
            fake.delayIssues(700);
            fake.failNext('none', 'none', 'drop-before-issue');
            const passStartedAt = Date.now();

            await fiscal.drain();

            const [, , third] = await dataSource.getRepository(Invoice).find({ order: { id: 'ASC' } });
            expect(third.fiscalStatus).toBe(InvoiceFiscalStatus.UNCERTAIN);
            // Two slow requests went up before this one. Stamped from the start of the pass, its
            // lease would have ended two minutes after that, with those seconds already spent.
            expect((third.fiscalNextAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(passStartedAt + FISCAL_LEASE_MS + 1_400);
        });

        it('sends nothing for a row that changed hands before it went up', async () => {
            const [invoice] = await issueOctober();
            // While this pass reads the series, somebody else settles the row and takes it again.
            fake.onNextRequest('/series', async () => {
                await dataSource.getRepository(Invoice).increment({ id: invoice.id }, 'fiscalAttempts', 1);
            });

            const result = await fiscal.drain();

            expect(result.stoppedBy).toBe('in_flight');
            expect(invoiceRequests()).toHaveLength(0);
            expect(fake.issued).toHaveLength(0);
        });
    });

    describe('a correction below zero', () => {
        it('is refused before it could go to SmartBill as a negative price', async () => {
            const [invoice] = await issueOctober();

            await request(app.getHttpServer()).put(`/invoices/${invoice.id}`).set('Authorization', admin.auth).send({ amount: -350 }).expect(400);

            expect((await reload(invoice.id)).amount).toBe(350);
        });
    });

    describe('the rate limit, on a PDF', () => {
        it('is recorded, so nothing calls SmartBill through the ten minutes', async () => {
            const [invoice] = await issueOctober();
            await fiscal.drain();
            const issued = await reload(invoice.id);
            fake.failNextPdf('lockout');

            await expect(smartBill.invoicePdf(issued.fiscalSeries as string, issued.fiscalNumber as string)).rejects.toMatchObject({ kind: 'throttled' });
            expect(smartBill.lockedOutUntil(new Date())).not.toBeNull();
        });
    });
});
