import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The payment as a figure, against a real database — E16/S1.
 *
 * The unit spec checks the derivation's arithmetic against a mocked SUM. This checks the part only
 * Postgres can show: that the payment and the state it implies commit together, that the sum is
 * really summed across rows, and that what goes over the wire when the recording admin is joined
 * in is the username and nothing else. The last one is the reason this suite exists: it was
 * written when `User` had no `select: false` on `passwordHash` and one careless
 * `leftJoinAndSelect` would have published every admin's hash to every parent with a payment. The
 * column is guarded now; the check stays, because `{ id, username }` is still all the office should
 * see of the admin who took the money — and a parent now sees none of it: a login name is half of
 * an admin's credential, and no screen of theirs shows it.
 */
describe('Payments (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let invoiceId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.payments'));
        parent = await registerUser(app, 'parinte.payments');

        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Copil', lastName: 'Plătitor', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        await enrolInNewGroup(app, admin, [child.body.id as number]);

        const invoices = await request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [profileId], dateIssued: '2026-03-01', monthIssued: '2026-03' })
            .expect(201);
        invoiceId = invoices.body[0].id as number;
    });

    const pay = (body: Record<string, unknown>) =>
        request(app.getHttpServer())
            .post('/payments')
            .set('Authorization', admin.auth)
            .send({ invoiceId, date: '2026-03-05', ...body });

    const invoiceStatus = async (): Promise<string> => {
        const rows = await dataSource.query<{ status: string }[]>('SELECT "status" FROM "invoices" WHERE "id" = $1', [invoiceId]);
        return rows[0].status;
    };

    describe('the derivation, for real', () => {
        it('a partial payment leaves the invoice pending; the covering instalment flips it', async () => {
            await pay({ amount: 100 }).expect(201);
            expect(await invoiceStatus()).toBe('pending');

            await pay({ amount: 250 }).expect(201);
            expect(await invoiceStatus()).toBe('paid');
        });

        it('an initiated transfer pays nothing until somebody marks it succeeded', async () => {
            const payment = await pay({ amount: 350, method: 'bank_transfer', status: 'initiated', externalReference: 'OP 77' }).expect(201);
            expect(await invoiceStatus()).toBe('pending');

            await request(app.getHttpServer())
                .put(`/payments/${payment.body.id as number}`)
                .set('Authorization', admin.auth)
                .send({ status: 'succeeded' })
                .expect(200);
            expect(await invoiceStatus()).toBe('paid');
        });

        it('deleting the covering payment takes the invoice back to pending', async () => {
            const payment = await pay({ amount: 350 }).expect(201);
            expect(await invoiceStatus()).toBe('paid');

            await request(app.getHttpServer())
                .delete(`/payments/${payment.body.id as number}`)
                .set('Authorization', admin.auth)
                .expect(200);
            expect(await invoiceStatus()).toBe('pending');
        });

        it('refuses free-text methods — the list is closed now', async () => {
            await pay({ amount: 350, method: 'credit_card' }).expect(400);
        });

        it('refuses a payment with no amount — a payment is a figure, not a flag', async () => {
            await pay({}).expect(400);
        });
    });

    describe('a month at a time', () => {
        it('lists one month by its dates, and what waits on somebody whatever its month', async () => {
            // The screen asked for every payment ever recorded: 9.6 MB and 1.9 GB of browser memory at
            // three years (review of 26 September 2026). It now asks for a month, plus these.
            const march = await pay({ amount: 100, date: '2026-03-05' }).expect(201);
            const announced = await pay({ amount: 50, date: '2026-03-20', method: 'bank_transfer', status: 'initiated' }).expect(201);
            const april = await pay({ amount: 100, date: '2026-04-02' }).expect(201);
            const list = (query: string) => request(app.getHttpServer()).get(`/payments?${query}`).set('Authorization', admin.auth).expect(200);

            const inApril = await list('dateFrom=2026-04-01&dateTo=2026-04-30');
            const waiting = await list('needsAction=true');

            expect((inApril.body as { id: number }[]).map((row) => row.id)).toEqual([april.body.id]);
            // The announced transfer from March is still somebody's job in April; the settled ones are not.
            expect((waiting.body as { id: number }[]).map((row) => row.id)).toEqual([announced.body.id]);
            expect((waiting.body as { id: number }[]).map((row) => row.id)).not.toContain(march.body.id);
        });
    });

    describe('waived invoices', () => {
        it('refuses money against a waived month, with its own code', async () => {
            // A waived invoice comes from the issuing screen writing a zero row.
            await dataSource.query(`UPDATE "invoices" SET "status" = 'waived', "amount" = 0 WHERE "id" = $1`, [invoiceId]);

            const res = await pay({ amount: 100 }).expect(409);
            expect(res.body.code).toBe('INVOICE_WAIVED');
        });
    });

    /**
     * The review of 25 September 2026. The status is derived — from the payments, from a zero amount
     * — and the payments are not deleted with their invoice.
     */
    describe('editing and deleting an invoice with money on it', () => {
        const edit = (body: Record<string, unknown>) => request(app.getHttpServer()).put(`/invoices/${invoiceId}`).set('Authorization', admin.auth).send(body);

        it('lowered to what was paid, the invoice is paid; raised again, it is owed again', async () => {
            await pay({ amount: 200 }).expect(201);

            const lowered = await edit({ amount: 200 }).expect(200);
            expect(lowered.body.status).toBe('paid');
            expect(await invoiceStatus()).toBe('paid');

            await edit({ amount: 350 }).expect(200);
            expect(await invoiceStatus()).toBe('pending');
        });

        it('takes zero, and the month is waived — no document to download', async () => {
            const res = await edit({ amount: 0 }).expect(200);

            expect(res.body.status).toBe('waived');
            expect(await invoiceStatus()).toBe('waived');
            await request(app.getHttpServer()).get(`/invoices/${invoiceId}/pdf`).set('Authorization', admin.auth).expect(404);
        });

        it('refuses zero while money sits on the invoice', async () => {
            await pay({ amount: 100 }).expect(201);

            const res = await edit({ amount: 0 }).expect(409);

            expect(res.body.code).toBe('INVOICE_HAS_PAYMENTS');
            const [row] = await dataSource.query<{ amount: string; status: string }[]>('SELECT "amount", "status" FROM "invoices" WHERE "id" = $1', [
                invoiceId,
            ]);
            expect(row).toMatchObject({ amount: '350.00', status: 'pending' });
        });

        it('refuses a status typed by hand', async () => {
            await edit({ status: 'paid' }).expect(400);
            expect(await invoiceStatus()).toBe('pending');
        });

        it('refuses to delete an invoice with payments, and keeps them — a failed one included', async () => {
            await pay({ amount: 100, method: 'bank_transfer', status: 'failed' }).expect(201);

            const res = await request(app.getHttpServer()).delete(`/invoices/${invoiceId}`).set('Authorization', admin.auth).expect(409);

            expect(res.body.code).toBe('INVOICE_HAS_PAYMENTS');
            const [{ count }] = await dataSource.query<{ count: string }[]>('SELECT COUNT(*) AS count FROM "payments" WHERE "invoice_id" = $1', [invoiceId]);
            expect(Number(count)).toBe(1);
        });
    });

    describe('what the wire carries', () => {
        it('the recording admin appears to the office as id and username, and never the credentials row', async () => {
            await pay({ amount: 350 }).expect(201);

            const list = await request(app.getHttpServer()).get('/payments').set('Authorization', admin.auth).expect(200);

            expect(list.body).toHaveLength(1);
            const recordedBy = list.body[0].recordedBy as Record<string, unknown>;
            expect(recordedBy.username).toBe('admin.payments');
            // The query shape is the first line; `select: false` on the column is the second.
            expect(recordedBy.passwordHash).toBeUndefined();
            expect(Object.keys(recordedBy).sort()).toEqual(['id', 'username']);
        });

        /**
         * The username is how an admin signs in, and the login route is throttled per address, not
         * per account — so handing it to every family with a payment is handing out half of the
         * credential that opens every family's record. No parent screen shows who recorded a payment.
         */
        it('does not tell a parent the login name of the admin who recorded their payment', async () => {
            const payment = await pay({ amount: 350 }).expect(201);

            const list = await request(app.getHttpServer()).get('/payments').set('Authorization', parent.auth).expect(200);
            const one = await request(app.getHttpServer())
                .get(`/payments/${payment.body.id as number}`)
                .set('Authorization', parent.auth)
                .expect(200);

            expect(list.body).toHaveLength(1);
            expect(list.body[0].recordedBy).toBeUndefined();
            expect(one.body.recordedBy).toBeUndefined();
            expect(JSON.stringify([list.body, one.body])).not.toContain('admin.payments');
        });

        it('a parent sees their own payments and not the figures of another family', async () => {
            await pay({ amount: 350 }).expect(201);
            const other = await registerUser(app, 'alt.parinte');
            const list = await request(app.getHttpServer()).get('/payments').set('Authorization', other.auth).expect(200);
            expect(list.body).toEqual([]);
        });

        /**
         * The review of 25 September 2026: the portal showed a family that had paid 100 of 350 the
         * whole 350 as still to pay. Only succeeded money counts, as on the arrears screen.
         */
        it('tells the family what is left on each invoice, not only its total', async () => {
            await pay({ amount: 100 }).expect(201);
            await pay({ amount: 50, method: 'bank_transfer', status: 'initiated' }).expect(201);

            const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', parent.auth).expect(200);
            const one = await request(app.getHttpServer()).get(`/invoices/${invoiceId}`).set('Authorization', parent.auth).expect(200);

            expect(list.body[0]).toMatchObject({ id: invoiceId, amount: 350, paid: 100, outstanding: 250 });
            expect(one.body).toMatchObject({ amount: 350, paid: 100, outstanding: 250 });
        });
    });
});
