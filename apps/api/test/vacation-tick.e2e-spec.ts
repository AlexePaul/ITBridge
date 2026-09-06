import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The vacation tick — E12/S8, against a real database.
 *
 * A fact about one hour, put there by whoever took the register: it was held in a school holiday,
 * for whoever wanted to come. What it costs is E15/S9's business and tested there; here is what
 * can and cannot carry the tick, and where it shows.
 */
describe('The vacation tick on a session (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;

    const tick = (sessionId: number, isVacation: boolean, user: TestUser = admin) =>
        request(app.getHttpServer()).put(`/class-sessions/${sessionId}/vacation`).set('Authorization', user.auth).send({ isVacation });

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.vacanta'));
        parent = await registerUser(app, 'parinte.vacanta');
        const roomId = await createRoom(app, admin, { slug: 'vac-loc', name: 'Vacanță' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
    });

    afterAll(async () => {
        await app.close();
    });

    it('is off by default, goes on, and comes off again', async () => {
        const sessionId = await createClassSession(dataSource, groupId, { date: '2027-12-27' });

        const before = await request(app.getHttpServer())
            .get('/class-sessions?dateFrom=2027-12-27&dateTo=2027-12-27')
            .set('Authorization', admin.auth)
            .expect(200);
        expect(before.body[0].isVacation).toBe(false);

        expect((await tick(sessionId, true).expect(200)).body.isVacation).toBe(true);
        expect((await tick(sessionId, false).expect(200)).body.isVacation).toBe(false);
    });

    it('shows on the register, where the teacher puts it', async () => {
        const sessionId = await createClassSession(dataSource, groupId, { date: '2027-12-27' });
        await tick(sessionId, true).expect(200);

        const register = await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', admin.auth).expect(200);
        expect(register.body.session.isVacation).toBe(true);
    });

    it('refuses a cancelled session — an hour that did not happen was not held in anything', async () => {
        const sessionId = await createClassSession(dataSource, groupId, { date: '2027-12-27', status: 'cancelled' });

        const res = await tick(sessionId, true).expect(409);
        expect(res.body.code).toBe('CLASS_SESSION_CANCELLED');
    });

    it('freezes once the teaching month is invoiced — the tick would change what a family paid', async () => {
        // Enrol a child and mark the session, so the month has something to invoice.
        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        await request(app.getHttpServer())
            .post('/enrollments')
            .set('Authorization', admin.auth)
            .send({ childId: child.body.id as number, groupId, startDate: '2027-11-01' })
            .expect(201);
        // Monday 27 December 2027 opens a week of December; the month is still open.
        const sessionId = await createClassSession(dataSource, groupId, { date: '2027-12-27' });
        await request(app.getHttpServer())
            .put(`/attendance/session/${sessionId}/child/${child.body.id}`)
            .set('Authorization', admin.auth)
            .send({ present: true })
            .expect(200);
        await tick(sessionId, true).expect(200);

        await request(app.getHttpServer())
            .post('/invoices/issue')
            .set('Authorization', admin.auth)
            .send({ monthIssued: '2027-12', dateIssued: '2028-01-01' })
            .expect(201);

        const res = await tick(sessionId, false).expect(409);
        expect(res.body.code).toBe('MONTH_ALREADY_INVOICED');
    });

    it('is the office’s to put, not a family’s', async () => {
        const sessionId = await createClassSession(dataSource, groupId, { date: '2027-12-27' });
        await tick(sessionId, true, parent).expect(403);
    });
});
