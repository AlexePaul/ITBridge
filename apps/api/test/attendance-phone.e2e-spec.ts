import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The tap-to-mark endpoints, against a real database — E12/S6.
 *
 * The unit spec holds the branching; this holds what only Postgres shows: that the upsert really
 * writes one row per (child, class) however many times it is called, and that the register's one
 * payload carries the marks and the parent's phone the way the screen will read them.
 */
describe('Tap-to-mark attendance (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let childId: number;
    let groupId: number;
    let sessionId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.tap'));
        parent = await registerUser(app, 'parinte.tap');

        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;

        const roomId = await createRoom(app, admin, { slug: 'tap-loc', name: 'Tap' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
        await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);

        sessionId = await createClassSession(dataSource, groupId, { date: '2026-03-09' });
    });

    const put = (present: boolean, session = sessionId, child = childId) =>
        request(app.getHttpServer()).put(`/attendance/session/${session}/child/${child}`).set('Authorization', admin.auth).send({ present });

    const rows = () => dataSource.query<{ present: boolean }[]>('SELECT "present" FROM "attendances"');

    describe('the upsert', () => {
        it('one row per child per class, however many taps arrive', async () => {
            await put(true).expect(200);
            await put(true).expect(200);
            await put(false).expect(200);

            const all = await rows();
            expect(all).toHaveLength(1);
            // The last tap wins — a changed mind is a second write, never a 409.
            expect(all[0].present).toBe(false);
        });

        it('refuses a cancelled class — nobody was present at a class that did not happen', async () => {
            const cancelled = await createClassSession(dataSource, groupId, { date: '2026-03-16', status: 'cancelled' });
            await put(true, cancelled).expect(400);
        });

        it('is closed to parents', async () => {
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${childId}`)
                .set('Authorization', parent.auth)
                .send({ present: true })
                .expect(403);
        });
    });

    describe('the register', () => {
        it('carries the child, the mark and the parent phone in one payload', async () => {
            await put(false).expect(200);

            const res = await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', admin.auth).expect(200);

            expect(res.body.session).toMatchObject({ groupId, groupName: 'Scratch Începători' });
            expect(res.body.entries).toHaveLength(1);
            // The phone the tel: button dials. Registration normalizes to +40…, so the register
            // answers the normalized form.
            expect(res.body.entries[0]).toMatchObject({ childId, firstName: 'Ana', present: false });
            expect(typeof res.body.entries[0].parentPhone).toBe('string');
        });

        it('answers null, not a missing key, for an unmarked child', async () => {
            const res = await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', admin.auth).expect(200);
            expect(res.body.entries[0].present).toBeNull();
            expect(res.body.entries[0].attendanceId).toBeNull();
        });

        it('is closed to parents — it carries other families’ phones', async () => {
            await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', parent.auth).expect(403);
        });
    });
});
