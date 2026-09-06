import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The receipt, end to end — E16/S6.
 *
 * The acceptance is one sentence: *părintele primește confirmarea în aceeași zi, fără intervenție.*
 * The half of it that needs a real database is the "fără intervenție" — the message has to be
 * written by the same request that records the money, in the same transaction, without anybody
 * pressing a second button.
 *
 * What the unit spec cannot show and this can: that the row is really in `outbox` after the HTTP
 * call returns, that the figure in it came from a `SUM` across payment rows rather than from the
 * one just posted, and that a family with no address leaves an `undeliverable` row rather than
 * nothing at all.
 */
describe('Payment receipts (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;
    let invoiceId: number;

    const PARENT_EMAIL = 'parinte.chitante@example.com';

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.chitante'));
        parent = await registerUser(app, 'parinte.chitante');
        profileId = await ownProfileId(app, parent);

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Vlad', lastName: 'Ionescu', birthDate: '2016-01-01', parentId: profileId })
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

    /** Every message written to this family, newest first. */
    const receipts = () =>
        dataSource.query<{ subject: string; bodyText: string; to: string; status: string; undeliverableReason: string | null }[]>(
            'SELECT "subject", "bodyText", "to", "status", "undeliverableReason" FROM "outbox" WHERE "dedupeKey" LIKE \'receipt:%\' ORDER BY id DESC',
        );

    it('confirms a payment that settles the invoice, without anybody asking it to', async () => {
        await pay({ amount: 350 }).expect(201);

        const rows = await receipts();
        expect(rows).toHaveLength(1);
        expect(rows[0].to).toBe(PARENT_EMAIL);
        expect(rows[0].status).toBe('pending');
        expect(rows[0].bodyText).toContain('350 lei');
        expect(rows[0].bodyText).toContain('martie');
        // Settled: the message must not invite the family to pay anything more.
        expect(rows[0].bodyText).toContain('achitată integral');
    });

    it('names what is left when the payment covered only part of it', async () => {
        await pay({ amount: 200 }).expect(201);

        const rows = await receipts();
        expect(rows[0].bodyText).toContain('200 lei');
        // 350 − 200, and the number a second reminder would quote. The two have to agree.
        expect(rows[0].bodyText).toContain('150 lei');
    });

    it('counts what was already paid, not just the sum in this request', async () => {
        await pay({ amount: 200 }).expect(201);
        await pay({ amount: 100 }).expect(201);

        const rows = await receipts();
        expect(rows).toHaveLength(2);
        // The second receipt says 100 arrived and 50 remain — 350 − (200 + 100). A composer that
        // subtracted only this payment would have said 250, which is the figure the family would
        // then be chased for.
        expect(rows[0].bodyText).toContain('100 lei');
        expect(rows[0].bodyText).toContain('50 lei');
    });

    it('says nothing about money that has not arrived', async () => {
        await pay({ amount: 350, status: 'initiated' }).expect(201);
        expect(await receipts()).toHaveLength(0);
    });

    it('confirms an initiated payment at the moment it is marked succeeded', async () => {
        const created = await pay({ amount: 350, status: 'initiated' }).expect(201);
        expect(await receipts()).toHaveLength(0);

        await request(app.getHttpServer()).patch(`/payments/${created.body.id}`).set('Authorization', admin.auth).send({ status: 'succeeded' }).expect(200);

        const rows = await receipts();
        expect(rows).toHaveLength(1);
        expect(rows[0].bodyText).toContain('achitată integral');
    });

    it('confirms once, however many times the payment is edited afterwards', async () => {
        const created = await pay({ amount: 350 }).expect(201);

        await request(app.getHttpServer())
            .patch(`/payments/${created.body.id}`)
            .set('Authorization', admin.auth)
            .send({ externalReference: 'OP 4242' })
            .expect(200);

        // The unique index on `dedupeKey` is what holds this, not an `if` anybody has to remember.
        expect(await receipts()).toHaveLength(1);
    });

    it('records a family with no address rather than skipping them', async () => {
        // The school's own row: a family entered from a phone call — a profile with no account and
        // no email. It needs an enrolled child, because the amount counts active enrolments and a
        // zero invoice is written as `waived`, which refuses payments by design (E15).
        const shell = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Fără', lastName: 'Adresă' })
            .expect(201);
        const shellId = shell.body.id as number;

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Radu', lastName: 'Adresă', birthDate: '2016-01-01', parentId: shellId })
            .expect(201);
        await enrolInNewGroup(app, admin, [child.body.id as number]);

        const invoices = await request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [shellId], dateIssued: '2026-03-01', monthIssued: '2026-03' })
            .expect(201);

        await request(app.getHttpServer())
            .post('/payments')
            .set('Authorization', admin.auth)
            .send({ invoiceId: invoices.body[0].id as number, amount: invoices.body[0].amount as number, date: '2026-03-05' })
            .expect(201);

        const rows = await receipts();
        expect(rows).toHaveLength(1);
        // E17/S5: terminal, with the reason typed, and the address left empty rather than invented.
        expect(rows[0].status).toBe('undeliverable');
        expect(rows[0].undeliverableReason).toBe('no_address');
        expect(rows[0].to).toBe('');
    });
});
