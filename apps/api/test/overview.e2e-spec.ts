import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, enrolInNewGroup, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The overview — E21/S1, against a real database.
 *
 * What is worth proving here is not the arithmetic but the **agreement**: every number on this
 * screen has another screen that shows the same thing in more detail, and the two must not be able
 * to disagree. So each assertion below reads the overview and the endpoint it summarises, and
 * compares them.
 */
describe('Overview (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let profileId: number;
    let groupId: number;
    let childId: number;

    const TODAY = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.ansamblu'));
        parent = await registerUser(app, 'parinte.ansamblu');
        profileId = await ownProfileId(app, parent);

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Maria', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;
        groupId = await enrolInNewGroup(app, admin, [childId]);
    });

    const overview = (user: TestUser = admin) => request(app.getHttpServer()).get('/overview').set('Authorization', user.auth);

    describe('today', () => {
        it('lists the classes of the day and says how many are marked', async () => {
            const session = await createClassSession(dataSource, groupId, { date: iso(TODAY) });

            const before = await overview().expect(200);
            expect(before.body.today).toMatchObject({ total: 1, marked: 0 });
            expect(before.body.today.sessions[0]).toMatchObject({ id: session, marked: false });

            await request(app.getHttpServer())
                .put(`/attendance/session/${session}/child/${childId}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);

            const after = await overview().expect(200);
            expect(after.body.today).toMatchObject({ total: 1, marked: 1 });
        });

        it('leaves out other days', async () => {
            await createClassSession(dataSource, groupId, { date: iso(new Date(Date.now() + 7 * 86400000)) });
            expect((await overview().expect(200)).body.today.total).toBe(0);
        });
    });

    describe('it agrees with the screens it summarises', () => {
        it('the arrears figure matches the arrears list, to the leu', async () => {
            await request(app.getHttpServer())
                .post('/invoices/issue')
                .set('Authorization', admin.auth)
                .send({
                    monthIssued: '2026-03',
                    dateIssued: '2026-03-01',
                    families: [{ parentId: profileId, children: [{ childId, sessions: 4 }] }],
                })
                .expect(201);

            const list = await request(app.getHttpServer()).get('/invoices/arrears').set('Authorization', admin.auth).expect(200);
            const summary = (await overview().expect(200)).body.arrears;

            const listTotal = list.body.reduce((sum: number, row: { outstanding: number }) => sum + row.outstanding, 0);
            expect(summary.outstanding).toBe(listTotal);
            // Families, not invoices: one family with two unpaid months is one phone call.
            expect(summary.families).toBe(new Set(list.body.map((row: { parentId: number }) => row.parentId)).size);
        });

        it('the pending-approvals count matches the approvals screen', async () => {
            await registerUser(app, 'nou.ansamblu', 'parola123', { active: false });

            const queue = await request(app.getHttpServer()).get('/users/pending').set('Authorization', admin.auth).expect(200);
            const summary = await overview().expect(200);

            expect(summary.body.pendingApprovals).toBe(queue.body.length);
        });

        it('counts a group as nearly full only when the seats say so, trials included', async () => {
            const empty = await overview().expect(200);
            expect(empty.body.groupsNearlyFull).toEqual([]);

            // Fill the group to its capacity of ten. Occupancy counts trials as seats (D7), so the
            // overview must see the same number the group screen does.
            for (let i = 0; i < 9; i++) {
                const extra = await registerUser(app, `familie${i}.ansamblu`);
                const extraProfile = await ownProfileId(app, extra);
                const kid = await request(app.getHttpServer())
                    .post('/children')
                    .set('Authorization', extra.auth)
                    .send({ firstName: `Copil${i}`, lastName: 'Test', birthDate: '2016-01-01', parentId: extraProfile })
                    .expect(201);
                await request(app.getHttpServer()).post(`/children/${kid.body.id as number}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);
            }

            const full = await overview().expect(200);
            expect(full.body.groupsNearlyFull).toHaveLength(1);
            expect(full.body.groupsNearlyFull[0]).toMatchObject({ groupId, free: 0, taken: 10 });
        });
    });

    describe('the queues that go stale', () => {
        it('counts messages that had nowhere to go', async () => {
            // A family with no address: approving them records an undeliverable message (E17/S5).
            const silent = await registerUser(app, 'fara.adresa.ansamblu', 'parola123', { active: false });
            await dataSource.query('UPDATE "profiles" SET "email" = NULL WHERE "user_id" = $1', [silent.userId]);
            await request(app.getHttpServer()).post(`/users/${silent.userId}/approve`).set('Authorization', admin.auth).expect(200);

            expect((await overview().expect(200)).body.undeliverableMessages).toBe(1);
        });
    });

    describe('who may look', () => {
        it('refuses a parent — it is the whole school on one screen, money included', async () => {
            await overview(parent).expect(403);
        });
    });
});
