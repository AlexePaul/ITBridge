import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, holdSessions, ownProfileId, promoteToAdmin, registerUser, teachingMondays, TestUser, truncateAll } from './helpers';

/**
 * The percentage discount, against a real database — E15/S5, and the referral of E20/S5 that gave
 * it a customer.
 *
 * The unit spec holds the arithmetic. This holds the two things only the whole stack shows: that a
 * percentage stored against a family really halves the invoice the issuing screen produces, and
 * that 200% is refused rather than silently clamped to a free month by the floor in `pricing.ts`.
 */
describe('Discounts (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;
    let childId: number;
    let groupId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.discounts'));
        parent = await registerUser(app, 'parinte.discounts');
        profileId = await ownProfileId(app, parent);

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;
        groupId = await enrolInNewGroup(app, admin, [childId], {}, { startDate: '2026-01-01' });
    });

    const grant = (body: Record<string, unknown>) =>
        request(app.getHttpServer())
            .post('/discounts')
            .set('Authorization', admin.auth)
            .send({ parentId: profileId, name: 'Recomandare', monthIssued: '2026-03', ...body });

    /**
     * Issues March with that many sessions held — E15/S9: the count comes from the registers, so
     * the fixture holds the sessions rather than typing the number. Always 201: a month that comes
     * to nothing is a waived row, not a refusal.
     */
    const issue = async (sessions: number) => {
        await holdSessions(app, dataSource, admin, groupId, [childId], teachingMondays('2026-03').slice(0, sessions));
        return request(app.getHttpServer())
            .post('/invoices/issue')
            .set('Authorization', admin.auth)
            .send({ monthIssued: '2026-03', dateIssued: '2026-03-01' })
            .expect(201);
    };

    describe('the referral, end to end', () => {
        it('50% halves the month the issuing screen produces: 350 becomes 175', async () => {
            await grant({ type: 'percent', value: 50 }).expect(201);

            const res = await issue(4);

            expect(Number(res.body.issued[0].amount)).toBe(175);
        });

        it('tracks a short month down, which a fixed amount could not', async () => {
            await grant({ type: 'percent', value: 50 }).expect(201);

            // Three sessions is 262.50; half is 131.25. A 175-lei fixed discount would have been
            // wrong here by 43.75, and nobody would have noticed.
            const res = await issue(3);

            expect(Number(res.body.issued[0].amount)).toBe(131.25);
        });

        it('still defaults to lei when no type is sent, so old callers are unchanged', async () => {
            await grant({ value: 50 }).expect(201);

            const res = await issue(4);

            expect(Number(res.body.issued[0].amount)).toBe(300);
        });
    });

    describe('the cap', () => {
        it('refuses 200%, instead of clamping it into a free month nobody explained', async () => {
            const res = await grant({ type: 'percent', value: 200 }).expect(400);
            expect(res.body.code).toBe('DISCOUNT_PERCENT_OVER_100');
        });

        it('accepts exactly 100% — a month given away is a decision, not a typo', async () => {
            await grant({ type: 'percent', value: 100 }).expect(201);
            const res = await issue(4);
            // Zero, and recorded as a waived row rather than skipped.
            expect(res.body.waived).toHaveLength(1);
        });

        it('refuses a percentage that only becomes invalid on update', async () => {
            const created = await grant({ type: 'fixed', value: 200 }).expect(201);

            // The value was fine as lei; the type change is what breaks it, and only the merged
            // row shows that.
            const res = await request(app.getHttpServer())
                .put(`/discounts/${created.body.id as number}`)
                .set('Authorization', admin.auth)
                .send({ type: 'percent' })
                .expect(400);
            expect(res.body.code).toBe('DISCOUNT_PERCENT_OVER_100');
        });

        it('a fixed amount has no ceiling, and the floor keeps it harmless', async () => {
            await grant({ type: 'fixed', value: 5000 }).expect(201);
            const res = await issue(4);
            expect(res.body.waived).toHaveLength(1);
        });
    });

    describe('who may grant one', () => {
        it('refuses a parent', async () => {
            await request(app.getHttpServer())
                .post('/discounts')
                .set('Authorization', parent.auth)
                .send({ parentId: profileId, name: 'Recomandare', type: 'percent', value: 50, monthIssued: '2026-03' })
                .expect(403);
        });
    });
});
