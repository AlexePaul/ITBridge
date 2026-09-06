import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Announced absences, against a real database — E12/S3.
 *
 * The unit specs hold the cutoff arithmetic and the branching. This holds the two things only the
 * whole stack shows: that one family cannot speak for another's child, and that what a parent
 * announces really reaches the register the teacher opens on their phone.
 */
describe('Absence notices (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let bogdan: TestUser;

    let anaChildId: number;
    let bogdanChildId: number;
    let groupId: number;
    let sessionId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    /** Registers a parent with one child, enrolled in the shared group. */
    async function family(username: string, childName: string): Promise<number> {
        const parent = username === 'ana.absente' ? ana : bogdan;
        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: childName, lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        const childId = child.body.id as number;
        await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);
        return childId;
    }

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.absente'));
        ana = await registerUser(app, 'ana.absente');
        bogdan = await registerUser(app, 'bogdan.absente');

        const roomId = await createRoom(app, admin, { slug: 'absente-loc', name: 'Absențe' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;

        anaChildId = await family('ana.absente', 'Ana');
        bogdanChildId = await family('bogdan.absente', 'Bogdan');

        // Far in the future, so the notice is always in time whenever the suite runs.
        sessionId = await createClassSession(dataSource, groupId, { date: '2027-06-07' });
    });

    const announce = (user: TestUser, body: Record<string, unknown>) =>
        request(app.getHttpServer())
            .post('/attendance/absences')
            .set('Authorization', user.auth)
            .send({ childId: anaChildId, classSessionId: sessionId, reason: 'Răcit', ...body });

    describe('who may speak for whom', () => {
        it('an admin announces for anyone — they took the phone call', async () => {
            const res = await announce(admin, {}).expect(201);
            expect(res.body.inTime).toBe(true);
            await announce(admin, { childId: bogdanChildId }).expect(201);
        });

        /**
         * The portal button is gone and so is the route behind it — E12/S3.
         *
         * A family announces by ringing, messaging or emailing, and somebody at the office writes
         * it down with the reason. Had only the button gone, the rule would have been true of the
         * screen and false of the API, which is the same as not being true.
         */
        it('a parent cannot announce at all, not even for their own child', async () => {
            await announce(ana, {}).expect(403);
        });

        it('a parent cannot withdraw either — that is the same act, on the same phone line', async () => {
            const mine = await announce(admin, {}).expect(201);

            await request(app.getHttpServer())
                .delete(`/attendance/absences/${mine.body.id as number}`)
                .set('Authorization', ana.auth)
                .expect(403);
            await request(app.getHttpServer())
                .delete(`/attendance/absences/${mine.body.id as number}`)
                .set('Authorization', admin.auth)
                .expect(200);
        });
    });

    describe('one notice per child per class', () => {
        it('announcing twice amends rather than adding a second absence', async () => {
            const first = await announce(admin, { reason: 'Răcit' }).expect(201);
            const second = await announce(admin, { reason: 'Plecăm din oraș' }).expect(201);

            expect(second.body.id).toBe(first.body.id);
            const rows = await dataSource.query<unknown[]>('SELECT 1 FROM "absence_notices"');
            expect(rows).toHaveLength(1);
        });
    });

    describe('what it refuses', () => {
        it('a class the child is not in the group for', async () => {
            const otherRoom = await createRoom(app, admin, { slug: 'alta-loc', name: 'Alta', roomName: 'Sala 2' });
            const otherGroup = await request(app.getHttpServer())
                .post('/groups')
                .set('Authorization', admin.auth)
                .send(groupBody(otherRoom, { name: 'Python' }))
                .expect(201);
            const otherSession = await createClassSession(dataSource, otherGroup.body.id as number, { date: '2027-06-08' });

            const res = await announce(admin, { classSessionId: otherSession }).expect(400);
            expect(res.body.code).toBe('CHILD_NOT_IN_SESSION_GROUP');
        });

        it('a cancelled class — nobody can be absent from one that is not happening', async () => {
            const cancelled = await createClassSession(dataSource, groupId, { date: '2027-06-14', status: 'cancelled' });
            const res = await announce(admin, { classSessionId: cancelled }).expect(409);
            expect(res.body.code).toBe('CLASS_SESSION_CANCELLED');
        });

        it('a class whose register is already taken', async () => {
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${anaChildId}`)
                .set('Authorization', admin.auth)
                .send({ present: false })
                .expect(200);

            const res = await announce(admin, {}).expect(409);
            expect(res.body.code).toBe('ATTENDANCE_ALREADY_MARKED');
        });

        it('a reason too short to say anything', async () => {
            await announce(admin, { reason: 'x' }).expect(400);
        });
    });

    describe('what the teacher sees', () => {
        it('the announcement reaches the register, with the reason and whether it was in time', async () => {
            await announce(admin, { reason: 'Răcit, îl ținem acasă' }).expect(201);

            const register = await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', admin.auth).expect(200);

            const anaRow = register.body.entries.find((entry: { childId: number }) => entry.childId === anaChildId);
            expect(anaRow.announcedAbsence).toEqual({ reason: 'Răcit, îl ținem acasă', inTime: true });
            // Silence is a different fact, and reads as null rather than as an empty reason.
            const bogdanRow = register.body.entries.find((entry: { childId: number }) => entry.childId === bogdanChildId);
            expect(bogdanRow.announcedAbsence).toBeNull();
        });
    });

    describe('the upcoming list', () => {
        it('a parent sees their own and not the other family’s', async () => {
            await announce(admin, {}).expect(201);
            await announce(admin, { childId: bogdanChildId }).expect(201);

            const mine = await request(app.getHttpServer()).get('/attendance/absences').set('Authorization', ana.auth).expect(200);
            expect(mine.body).toHaveLength(1);
            expect(mine.body[0].child.id).toBe(anaChildId);

            const all = await request(app.getHttpServer()).get('/attendance/absences').set('Authorization', admin.auth).expect(200);
            expect(all.body).toHaveLength(2);
        });
    });
});
