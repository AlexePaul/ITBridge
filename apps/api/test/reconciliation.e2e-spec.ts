import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { Invoice, InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { Payment } from 'src/entities/payment.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { Profile } from 'src/entities/profile.entity';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';

/**
 * The bank statement against the platform — E16/S8's first half, end to end: a CSV shaped like a
 * Romanian bank's export goes in, the lines that pay an invoice are proposed, a person confirms,
 * and each confirmed line becomes a payment through the one door money comes in by.
 */
describe('Reconciling a bank statement (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let invoiceAna: Invoice;
    let invoiceMihai: Invoice;

    const MONDAYS = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];

    /** Two families, one child each at every October session, and October issued: 350 lei each. */
    const issueOctober = async (): Promise<void> => {
        const roomId = await createRoom(app, admin);
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        const sessions = await Promise.all(MONDAYS.map((date) => createClassSession(dataSource, group.body.id as number, { date })));
        for (const [username, firstName, lastName] of [
            ['ana', 'Ana', 'Popescu'],
            ['mihai', 'Mihai', 'Ionescu'],
        ]) {
            const parent = await registerUser(app, username);
            // The names a bank statement would carry; registration's own are placeholders.
            await dataSource.getRepository(Profile).update(await ownProfileId(app, parent), { firstName, lastName });
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', parent.auth)
                .send({ parentId: await ownProfileId(app, parent), firstName: 'Copil', lastName, birthDate: '2016-05-04' })
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
        }
        await request(app.getHttpServer())
            .post('/invoices/issue')
            .set('Authorization', admin.auth)
            .send({ monthIssued: '2026-10', dateIssued: '2026-11-01' })
            .expect(201);
        const invoices = await dataSource.getRepository(Invoice).find({ relations: { parent: true }, order: { id: 'ASC' } });
        invoiceAna = invoices.find((invoice) => invoice.parent.lastName === 'Popescu') as Invoice;
        invoiceMihai = invoices.find((invoice) => invoice.parent.lastName === 'Ionescu') as Invoice;
        // Ana's invoice carries a fiscal number, as if SmartBill had issued it: the reference families write.
        await dataSource.getRepository(Invoice).update(invoiceAna.id, { fiscalStatus: InvoiceFiscalStatus.ISSUED, fiscalSeries: 'ITB', fiscalNumber: '0041' });
    };

    const STATEMENT = [
        'Extras de cont;;;;',
        'Titular:;ITBRIDGE SCHOOL SRL;;;',
        ';;;;',
        'Data tranzactie;Descriere;Debit;Credit;Sold',
        '05.11.2026;"Incasare OP - BUNICA MARIA - plata ITB 0041";;350,00;1.350,00',
        '05.11.2026;Plata furnizor;120,50;;1.229,50',
        '06.11.2026;"IONESCU MIHAI cursuri noiembrie";;350,00;1.579,50',
        '07.11.2026;"Restituire chirie";;1.000,00;2.579,50',
        'Total rulaje;;120,50;1.700,00;',
    ].join('\r\n');

    const importStatement = (content = STATEMENT) =>
        request(app.getHttpServer()).post('/reconciliation/statements').set('Authorization', admin.auth).send({ content });
    const waiting = async () => (await request(app.getHttpServer()).get('/reconciliation/lines').set('Authorization', admin.auth).expect(200)).body;
    const lineAbout = async (text: string) => waiting().then((page) => page.lines.find((line: { description: string }) => line.description.includes(text)));

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        await issueOctober();
    });

    afterAll(async () => {
        await app.close();
    });

    it('keeps the money coming in, says what it could not read, and proposes what it can', async () => {
        const res = await importStatement().expect(200);

        expect(res.body).toMatchObject({ credits: 3, imported: 3, duplicates: 0, debits: 1, suggested: 2, suggestedByReference: 1 });
        expect(res.body.unreadable).toEqual([{ row: 9, reason: 'unreadable date "Total rulaje"' }]);
        expect(res.body.columns).toMatchObject({ date: 'Data tranzactie', amount: 'Credit', description: 'Descriere' });
    });

    it('adds nothing the second time the same statement comes in', async () => {
        await importStatement().expect(200);

        const again = await importStatement().expect(200);

        expect(again.body).toMatchObject({ credits: 3, imported: 0, duplicates: 3 });
        expect((await waiting()).counts).toEqual({ waiting: 3, matched: 0, ignored: 0 });
    });

    it('proposes by the fiscal reference whoever paid, and by name and sum otherwise', async () => {
        await importStatement().expect(200);

        const page = await waiting();
        expect(page.sureCount).toBe(1);
        expect(await lineAbout('ITB 0041')).toMatchObject({ suggestion: { invoiceId: invoiceAna.id, confidence: 'reference', overpays: false } });
        expect(await lineAbout('IONESCU')).toMatchObject({ suggestion: { invoiceId: invoiceMihai.id, confidence: 'name' } });
        expect(await lineAbout('chirie')).toMatchObject({ suggestion: null });
    });

    it('records the sure ones in one press, as transfers on the day of the statement', async () => {
        await importStatement().expect(200);

        const res = await request(app.getHttpServer()).post('/reconciliation/lines/confirm-suggested').set('Authorization', admin.auth).expect(200);

        expect(res.body).toEqual({ confirmed: 1, failed: 0 });
        const [payment] = await dataSource.getRepository(Payment).find({ relations: { invoice: true } });
        expect(payment).toMatchObject({ amount: 350, method: 'bank_transfer', status: 'succeeded', invoice: { id: invoiceAna.id } });
        // The statement's day, not the day it was imported.
        expect(toIsoDate(payment.date)).toBe('2026-11-05');
        expect(await dataSource.getRepository(Invoice).findOneByOrFail({ id: invoiceAna.id })).toMatchObject({ status: 'paid' });
        // Through the one door money comes in by: the family is told, like any other payment.
        expect(await dataSource.getRepository(OutboxMessage).findOneBy({ dedupeKey: `receipt:${payment.id}` })).not.toBeNull();
        expect((await waiting()).counts).toEqual({ waiting: 2, matched: 1, ignored: 0 });
    });

    it('records a line on the invoice a person picks, and only once', async () => {
        await importStatement().expect(200);
        const line = await lineAbout('IONESCU');

        await request(app.getHttpServer())
            .post(`/reconciliation/lines/${line.id as number}/match`)
            .set('Authorization', admin.auth)
            .send({ invoiceId: invoiceMihai.id })
            .expect(200);
        const again = await request(app.getHttpServer())
            .post(`/reconciliation/lines/${line.id as number}/match`)
            .set('Authorization', admin.auth)
            .send({ invoiceId: invoiceMihai.id })
            .expect(409);

        expect(again.body.code).toBe('STATEMENT_LINE_ALREADY_MATCHED');
        expect(await dataSource.getRepository(Payment).count()).toBe(1);
    });

    it('sets aside what is not a family paying, and brings it back', async () => {
        await importStatement().expect(200);
        const line = await lineAbout('chirie');

        await request(app.getHttpServer())
            .post(`/reconciliation/lines/${line.id as number}/ignore`)
            .set('Authorization', admin.auth)
            .expect(200);
        expect((await waiting()).counts).toEqual({ waiting: 2, matched: 0, ignored: 1 });

        await request(app.getHttpServer())
            .post(`/reconciliation/lines/${line.id as number}/reopen`)
            .set('Authorization', admin.auth)
            .expect(200);
        expect((await waiting()).counts).toEqual({ waiting: 3, matched: 0, ignored: 0 });
    });

    // Derived, not stored: the line stands where its payment does.
    it('puts a line back in the queue when its payment is deleted', async () => {
        await importStatement().expect(200);
        await request(app.getHttpServer()).post('/reconciliation/lines/confirm-suggested').set('Authorization', admin.auth).expect(200);
        const [payment] = await dataSource.getRepository(Payment).find();

        await request(app.getHttpServer()).delete(`/payments/${payment.id}`).set('Authorization', admin.auth).expect(200);

        expect((await waiting()).counts).toEqual({ waiting: 3, matched: 0, ignored: 0 });
    });

    it('refuses a file with no header it can read, and saying so', async () => {
        const res = await importStatement('ceva;altceva\n1;2').expect(400);

        expect(res.body.code).toBe('STATEMENT_UNREADABLE');
    });

    it('is not a parent’s to see', async () => {
        const parent = await registerUser(app, 'curios');

        await request(app.getHttpServer()).get('/reconciliation/lines').set('Authorization', parent.auth).expect(403);
    });
});
