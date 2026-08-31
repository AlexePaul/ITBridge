import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Moving a class, against a real database — E12/S5.
 *
 * The unit spec holds the refusal order; this holds what only Postgres shows: the row really
 * changes and keeps its identity, the school calendar really blocks the target day, and the
 * same-day check really guards the unique index rather than duplicating it.
 */
describe('Moving a class session (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let groupId: number;
    let sessionId: number;

    /** Mondays, which is `groupBody`'s weekday. */
    const MONDAY = '2027-04-05';
    const NEXT_MONDAY = '2027-04-12';

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.move'));

        const roomId = await createRoom(app, admin, { slug: 'move-loc', name: 'Move' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
        sessionId = await createClassSession(dataSource, groupId, { date: MONDAY });
    });

    const move = (body: Record<string, unknown>, id = sessionId) =>
        request(app.getHttpServer())
            .put(`/class-sessions/${id}/move`)
            .set('Authorization', admin.auth)
            .send({ reason: 'Test de mutare', ...body });

    it('moves the day and keeps the row — same id, note says where it came from', async () => {
        const res = await move({ date: '2027-04-06' }).expect(200);

        expect(res.body.id).toBe(sessionId);
        const rows = await dataSource.query<{ date: string; notes: string }[]>('SELECT "date"::text, "notes" FROM "class_sessions" WHERE "id" = $1', [
            sessionId,
        ]);
        expect(rows[0].date).toBe('2027-04-06');
        expect(rows[0].notes).toContain('Mutată (de pe 2027-04-05 16:00)');
    });

    it('the school calendar blocks the target day — the move has no side door around S2', async () => {
        await request(app.getHttpServer())
            .post('/class-sessions/non-teaching')
            .set('Authorization', admin.auth)
            .send({ name: 'Vacanța de primăvară', startDate: '2027-04-07', endDate: '2027-04-11' })
            .expect(201);

        const res = await move({ date: '2027-04-08' }).expect(409);
        expect(res.body.code).toBe('MOVED_ONTO_NON_TEACHING_DAY');
    });

    it('refuses a day the group already has a class on, as a sentence rather than a driver error', async () => {
        await createClassSession(dataSource, groupId, { date: NEXT_MONDAY });

        const res = await move({ date: NEXT_MONDAY }).expect(409);
        expect(res.body.code).toBe('GROUP_ALREADY_HAS_SESSION_THAT_DAY');
    });

    it('refuses a room busy at that hour, and names the clash', async () => {
        // A second group in the same room, same Monday, overlapping hours.
        const other = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(
                groupBody((await dataSource.query<{ id: number }[]>('SELECT "id" FROM "rooms" LIMIT 1'))[0].id, {
                    name: 'Python',
                    weekday: 2,
                    startTime: '17:00',
                    endTime: '18:30',
                }),
            )
            .expect(201);
        await createClassSession(dataSource, other.body.id as number, { date: '2027-04-06' });

        // Move ours onto that day at an overlapping hour, in the same room.
        const res = await move({ date: '2027-04-06', startTime: '17:30', endTime: '19:00' }).expect(409);
        expect(res.body.code).toBe('ROOM_BUSY_AT_THAT_TIME');
    });

    it('a taught class stays where it was', async () => {
        // Mark somebody present, which is what "taught" means to the register.
        const parent = await registerUser(app, 'parinte.move');
        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        await request(app.getHttpServer())
            .post(`/children/${child.body.id as number}/groups/${groupId}`)
            .set('Authorization', admin.auth)
            .expect(201);
        await request(app.getHttpServer())
            .post(`/attendance/session/${sessionId}`)
            .set('Authorization', admin.auth)
            .send({ childrenAttendance: [{ childId: child.body.id as number, present: true }] })
            .expect(201);

        const res = await move({ date: '2027-04-06' }).expect(409);
        expect(res.body.code).toBe('CLASS_SESSION_HAS_ATTENDANCE');
    });
});
