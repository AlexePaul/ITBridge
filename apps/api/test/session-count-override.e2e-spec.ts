import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, holdSessions, ownProfileId, promoteToAdmin, registerUser, teachingMondays, TestUser, truncateAll } from './helpers';

/**
 * The per-child override on the issuing screen — E15/S9, revised, against a real database.
 *
 * The count comes from the registers; this is the one number that still enters by hand, as a
 * recorded decision. What is proved here is the loop: the worksheet shows both numbers, the
 * invoice carries the decided one, clearing it brings the count back, and nothing can change once
 * the family's month is issued.
 */
describe('Session count overrides (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;
    let childId: number;

    const override = (body: Record<string, unknown>, user: TestUser = admin) =>
        request(app.getHttpServer())
            .put('/invoices/overrides')
            .set('Authorization', user.auth)
            .send({ monthIssued: '2026-10', childId, sessions: 3, ...body });

    const clear = (user: TestUser = admin) => request(app.getHttpServer()).delete(`/invoices/overrides/2026-10/${childId}`).set('Authorization', user.auth);

    const worksheetChild = async () => {
        const res = await request(app.getHttpServer()).get('/invoices/worksheet?monthIssued=2026-10').set('Authorization', admin.auth).expect(200);
        return { family: res.body.families[0], child: res.body.families[0].children[0] };
    };

    const issue = () =>
        request(app.getHttpServer()).post('/invoices/issue').set('Authorization', admin.auth).send({ monthIssued: '2026-10', dateIssued: '2026-11-01' });

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.corecturi'));
        parent = await registerUser(app, 'parinte.corecturi');
        profileId = await ownProfileId(app, parent);

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;
        // Four October Mondays held: the registers say 4.
        const groupId = await enrolInNewGroup(app, admin, [childId], {}, { startDate: '2026-09-01' });
        await holdSessions(app, dataSource, admin, groupId, [childId], teachingMondays('2026-10').slice(0, 4));
    });

    it('the worksheet shows both numbers, and the amount follows the decided one', async () => {
        expect((await worksheetChild()).child).toMatchObject({ sessions: 4, counted: 4, override: null });

        await override({ sessions: 3, reason: 'A venit doar la trei' }).expect(200);

        const { family, child } = await worksheetChild();
        expect(child).toMatchObject({ sessions: 3, counted: 4, override: { sessions: 3, reason: 'A venit doar la trei' } });
        // 3 × 87,50 — what the invoice will carry.
        expect(family.amount).toBe(262.5);
    });

    it('the invoice carries the decided number, not the count', async () => {
        await override({ sessions: 3 }).expect(200);

        const res = await issue().expect(201);
        expect(res.body.issued[0].amount).toBe(262.5);
    });

    it('a second decision replaces the first', async () => {
        await override({ sessions: 3 }).expect(200);
        await override({ sessions: 2, reason: 'Corectat' }).expect(200);

        const { child } = await worksheetChild();
        expect(child.override).toEqual({ sessions: 2, reason: 'Corectat' });
        const rows = await dataSource.query('SELECT count(*)::int AS n FROM session_count_overrides');
        expect(rows[0].n).toBe(1);
    });

    it('zero is a decision: the month is recorded as owing nothing', async () => {
        await override({ sessions: 0, reason: 'Luna asta nu o taxăm' }).expect(200);

        const res = await issue().expect(201);
        expect(res.body.issued).toHaveLength(0);
        expect(res.body.waived).toHaveLength(1);
    });

    it('clearing it lets the registers speak again', async () => {
        await override({ sessions: 3 }).expect(200);
        await clear().expect(200);

        expect((await worksheetChild()).child).toMatchObject({ sessions: 4, counted: 4, override: null });
    });

    it('records who decided', async () => {
        await override({ sessions: 3 }).expect(200);

        const rows = await dataSource.query('SELECT created_by_id, reason FROM session_count_overrides');
        expect(rows[0].created_by_id).toBe(admin.userId);
        expect(rows[0].reason).toBeNull();
    });

    it("freezes once the family's month is issued", async () => {
        await override({ sessions: 3 }).expect(200);
        await issue().expect(201);

        expect((await override({ sessions: 2 }).expect(409)).body.code).toBe('MONTH_ALREADY_INVOICED');
        expect((await clear().expect(409)).body.code).toBe('MONTH_ALREADY_INVOICED');
    });

    it('refuses a negative number, a missing child and a parent', async () => {
        await override({ sessions: -1 }).expect(400);
        await override({ childId: 9999 }).expect(404);
        await override({ sessions: 3 }, parent).expect(403);
        await clear(parent).expect(403);
    });
});
