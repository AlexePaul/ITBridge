import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The trail, against a real database — E07/S3.
 *
 * The unit specs hold the diffing and the shape of each entry. What only the whole stack shows is
 * the story's own acceptance: after somebody changes an invoice's amount, "who did it and when" is
 * one request away — and it is a request no parent can make.
 */
describe('Audit log (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;
    let invoiceId: number;
    /** What the month came to, read back rather than assumed: the price is per session (E15/S9). */
    let invoiceAmount: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.audit'));
        parent = await registerUser(app, 'parinte.audit');

        profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Copil', lastName: 'Auditat', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        await enrolInNewGroup(app, admin, [child.body.id as number]);

        const invoices = await request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [profileId], dateIssued: '2026-03-01', monthIssued: '2026-03' })
            .expect(201);
        invoiceId = invoices.body[0].id as number;
        invoiceAmount = invoices.body[0].amount as number;
    });

    const trailFor = async (entityType: string, entityId: number) => {
        const res = await request(app.getHttpServer()).get('/audit').query({ entityType, entityId }).set('Authorization', admin.auth).expect(200);
        return res.body as { action: string; actorUsername: string; changes: Record<string, { from: unknown; to: unknown }>; occurredAt: string }[];
    };

    /** The story's acceptance, end to end. */
    it("answers 'who changed this invoice's amount and when'", async () => {
        await request(app.getHttpServer()).put(`/invoices/${invoiceId}`).set('Authorization', admin.auth).send({ amount: 275 }).expect(200);

        const trail = await trailFor('Invoice', invoiceId);
        const edit = trail.find((entry) => entry.action === 'UPDATED');

        expect(edit).toBeDefined();
        expect(edit!.actorUsername).toBe('admin.audit');
        expect(edit!.changes.amount).toEqual({ from: invoiceAmount, to: 275 });
        expect(Date.parse(edit!.occurredAt)).not.toBeNaN();
    });

    it('records the issuing too, so the row has a beginning as well as an edit', async () => {
        const trail = await trailFor('Invoice', invoiceId);

        expect(trail.map((entry) => entry.action)).toEqual(['CREATED']);
        expect(trail[0].changes.amount).toEqual({ from: null, to: invoiceAmount });
    });

    it('reads newest first', async () => {
        await request(app.getHttpServer()).put(`/invoices/${invoiceId}`).set('Authorization', admin.auth).send({ amount: 275 }).expect(200);
        await request(app.getHttpServer()).put(`/invoices/${invoiceId}`).set('Authorization', admin.auth).send({ amount: 100 }).expect(200);

        const trail = await trailFor('Invoice', invoiceId);

        expect(trail.map((entry) => entry.action)).toEqual(['UPDATED', 'UPDATED', 'CREATED']);
        expect(trail[0].changes.amount).toEqual({ from: 275, to: 100 });
    });

    // A save that changed nothing is not an event, and a log full of those is a log nobody reads.
    it('writes nothing for an edit that moved nothing', async () => {
        await request(app.getHttpServer()).put(`/invoices/${invoiceId}`).set('Authorization', admin.auth).send({ amount: invoiceAmount }).expect(200);

        expect((await trailFor('Invoice', invoiceId)).map((entry) => entry.action)).toEqual(['CREATED']);
    });

    it('follows the money onto the payment that was recorded and then corrected', async () => {
        const created = await request(app.getHttpServer())
            .post('/payments')
            .set('Authorization', admin.auth)
            .send({ invoiceId, amount: 150, date: '2026-03-05' })
            .expect(201);
        const paymentId = created.body.id as number;

        await request(app.getHttpServer()).put(`/payments/${paymentId}`).set('Authorization', admin.auth).send({ amount: 200 }).expect(200);
        await request(app.getHttpServer()).delete(`/payments/${paymentId}`).set('Authorization', admin.auth).expect(200);

        const trail = await trailFor('Payment', paymentId);

        expect(trail.map((entry) => entry.action)).toEqual(['DELETED', 'UPDATED', 'CREATED']);
        expect(trail[1].changes.amount).toEqual({ from: 150, to: 200 });
        // The deletion keeps what the row held: after it there is nothing left to look at.
        expect(trail[0].changes.amount).toEqual({ from: 200, to: null });
    });

    it('records a discount given and taken back', async () => {
        const created = await request(app.getHttpServer())
            .post('/discounts')
            .set('Authorization', admin.auth)
            .send({ name: 'Frate', value: 50, monthIssued: '2026-03', parentId: profileId })
            .expect(201);
        const discountId = created.body.id as number;

        await request(app.getHttpServer()).delete(`/discounts/${discountId}`).set('Authorization', admin.auth).expect(200);

        const trail = await trailFor('Discount', discountId);
        expect(trail.map((entry) => entry.action)).toEqual(['DELETED', 'CREATED']);
    });

    /**
     * The log is a record of what the school's staff did. Handing a family a filtered slice of it
     * is a different feature with a different set of questions behind it — and an unfiltered one
     * would show them every other family's money.
     */
    it('is closed to parents', async () => {
        await request(app.getHttpServer()).get('/audit').set('Authorization', parent.auth).expect(403);
        await request(app.getHttpServer()).get('/audit').expect(401);
    });

    it('has no way in to change or remove an entry', async () => {
        const [entry] = await trailFor('Invoice', invoiceId);

        await request(app.getHttpServer()).put('/audit/1').set('Authorization', admin.auth).expect(404);
        await request(app.getHttpServer()).delete('/audit/1').set('Authorization', admin.auth).expect(404);
        await request(app.getHttpServer()).post('/audit').set('Authorization', admin.auth).send(entry).expect(404);
    });

    it('caps what one request can pull out of the history', async () => {
        await request(app.getHttpServer()).get('/audit').query({ limit: 201 }).set('Authorization', admin.auth).expect(400);
        await request(app.getHttpServer()).get('/audit').query({ limit: 200 }).set('Authorization', admin.auth).expect(200);
    });
});
