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
 * in is the username and nothing else. The last one is the reason this suite exists: `User` has no
 * `select: false` on `passwordHash`, so one careless `leftJoinAndSelect` would publish every
 * admin's hash to every parent with a payment.
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

    describe('waived invoices', () => {
        it('refuses money against a waived month, with its own code', async () => {
            // A waived invoice comes from the issuing screen writing a zero row.
            await dataSource.query(`UPDATE "invoices" SET "status" = 'waived', "amount" = 0 WHERE "id" = $1`, [invoiceId]);

            const res = await pay({ amount: 100 }).expect(409);
            expect(res.body.code).toBe('INVOICE_WAIVED');
        });
    });

    describe('what the wire carries', () => {
        it('the recording admin appears as id and username, and never the credentials row', async () => {
            await pay({ amount: 350 }).expect(201);

            const list = await request(app.getHttpServer()).get('/payments').set('Authorization', parent.auth).expect(200);

            expect(list.body).toHaveLength(1);
            const recordedBy = list.body[0].recordedBy as Record<string, unknown>;
            expect(recordedBy.username).toBe('admin.payments');
            // The whole point: `passwordHash` has no `select: false`, so only the query shape
            // stands between an admin's hash and every parent's browser.
            expect(recordedBy.passwordHash).toBeUndefined();
            expect(Object.keys(recordedBy).sort()).toEqual(['id', 'username']);
        });

        it('a parent sees their own payments and not the figures of another family', async () => {
            await pay({ amount: 350 }).expect(201);
            const other = await registerUser(app, 'alt.parinte');
            const list = await request(app.getHttpServer()).get('/payments').set('Authorization', other.auth).expect(200);
            expect(list.body).toEqual([]);
        });
    });
});
