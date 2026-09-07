import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Recovering a class that cannot be held, against a real database — E12/S9.
 *
 * The unit spec holds the refusal order and the three starting states. This holds what only
 * Postgres and the outbox show: the week keeps exactly one row for the group whichever state it
 * started in, the calendar really cancels and really blocks, the families get one message — the
 * move — and not a "se ține totuși" first, and the windows list really leaves out a room another
 * group is in.
 *
 * 2027-04-05 is a Monday, which is `groupBody`'s weekday.
 */
describe('Recovering a class that cannot be held (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;
    let roomId: number;
    let locationId: number;

    const MONDAY = '2027-04-05';
    const TUESDAY = '2027-04-06';
    const WEDNESDAY = '2027-04-07';
    const NEXT_MONDAY = '2027-04-12';

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.recuperare'));
        parent = await registerUser(app, 'parinte.recuperare');

        roomId = await createRoom(app, admin, { slug: 'recup-loc', name: 'Recuperări' });
        locationId = (await dataSource.query<{ location_id: number }[]>('SELECT "location_id" FROM "rooms" WHERE "id" = $1', [roomId]))[0].location_id;
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;

        // One family in the group, so there is somebody to write to.
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: await ownProfileId(app, parent) })
            .expect(201);
        await request(app.getHttpServer())
            .post(`/children/${child.body.id as number}/groups/${groupId}`)
            .set('Authorization', admin.auth)
            .expect(201);
    });

    const recover = (body: Record<string, unknown> = {}) =>
        request(app.getHttpServer())
            .post('/class-sessions/reschedule')
            .set('Authorization', admin.auth)
            .send({ groupId, date: MONDAY, targetDate: TUESDAY, reason: 'Luni e zi liberă legală', ...body });

    const windows = (date = MONDAY) =>
        request(app.getHttpServer()).get(`/class-sessions/reschedule-windows?groupId=${groupId}&date=${date}`).set('Authorization', admin.auth);

    const closeDay = (date: string, name = 'Zi liberă') =>
        request(app.getHttpServer())
            .post('/class-sessions/non-teaching')
            .set('Authorization', admin.auth)
            .send({ name, startDate: date, endDate: date })
            .expect(201);

    /** The group's rows in the week, oldest first. */
    const weekRows = () =>
        dataSource.query<{ id: number; date: string; status: string; notes: string | null }[]>(
            `SELECT "id", "date"::text, "status", "notes" FROM "class_sessions" WHERE "group_id" = $1 AND "date" BETWEEN $2 AND $3 ORDER BY "date" ASC`,
            [groupId, MONDAY, '2027-04-11'],
        );

    /** Only what the timetable writes; registration queues its own messages. */
    const queued = () =>
        dataSource.query<{ to: string; subject: string; dedupeKey: string }[]>(
            `SELECT "to", "subject", "dedupeKey" FROM "outbox" WHERE "dedupeKey" LIKE 'class-%' ORDER BY id ASC`,
        );

    it('moves a scheduled class inside its week: same row, new day, one message', async () => {
        const sessionId = await createClassSession(dataSource, groupId, { date: MONDAY });

        const res = await recover().expect(200);

        expect(res.body.id).toBe(sessionId);
        const rows = await weekRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: sessionId, date: TUESDAY, status: 'scheduled' });
        expect(rows[0].notes).toContain('Recuperată (de pe 2027-04-05 16:00): Luni e zi liberă legală');

        const messages = await queued();
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe(`${parent.username}@example.com`);
        expect(messages[0].dedupeKey).toMatch(/^class-moved:/);
        expect(messages[0].subject).toContain('se mută');
    });

    /**
     * The holiday was added after the timetable was written, so the calendar cancelled the row.
     * Through S5 this would be reinstate-then-move: two messages, the first of them — "the class
     * is on" on a public holiday — untrue for a minute. Here it is one act and one message.
     */
    it('recovers a class the calendar cancelled, in one act, with the cancellation kept in the notes', async () => {
        const sessionId = await createClassSession(dataSource, groupId, { date: MONDAY });
        await closeDay(MONDAY, 'Paște');
        expect((await weekRows())[0].status).toBe('cancelled');

        const before = await windows().expect(200);
        expect(before.body.source).toMatchObject({ id: sessionId, status: 'cancelled', hasAttendance: false });
        expect(before.body.missedDayClosed).toBe(true);
        expect(before.body.blocked).toBeNull();
        expect((before.body.windows as { date: string }[]).map((window) => window.date)).not.toContain(MONDAY);
        expect(before.body.windows).toEqual(expect.arrayContaining([expect.objectContaining({ date: TUESDAY, startTime: '16:00', endTime: '17:30', roomId })]));

        const res = await recover().expect(200);

        expect(res.body.id).toBe(sessionId);
        const rows = await weekRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: sessionId, date: TUESDAY, status: 'scheduled' });
        expect(rows[0].notes).toContain('Anulată automat: Paște');
        expect(rows[0].notes).toContain('Recuperată (de pe 2027-04-05 16:00)');

        // The calendar cancels without writing to anybody (S2 — a holiday is not news), so the
        // recovery's message is the only one, and it is a move, not a reinstatement.
        const messages = await queued();
        expect(messages.map((message) => message.dedupeKey.split(':')[0])).toEqual(['class-moved']);
    });

    /** The holiday was in the calendar first, so the generator skipped the day and wrote nothing. */
    it('writes the row the generator skipped, on the target day, and nothing on the holiday', async () => {
        await closeDay(MONDAY, 'Paște');
        const generated = await request(app.getHttpServer())
            .post('/class-sessions/generate')
            .set('Authorization', admin.auth)
            .send({ groupId, from: MONDAY, weeks: 1 })
            .expect(201);
        expect(generated.body).toMatchObject({ created: 0, skipped: 1 });
        expect(await weekRows()).toEqual([]);

        const before = await windows().expect(200);
        expect(before.body.source).toBeNull();
        expect(before.body.missedDayClosed).toBe(true);
        expect(before.body.usual).toEqual({ startTime: '16:00', endTime: '17:30', roomId, roomName: 'Sala 1' });

        const res = await recover().expect(200);

        const rows = await weekRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: res.body.id as number, date: TUESDAY, status: 'scheduled' });
        expect(rows[0].notes).toBe('Recuperată (de pe 2027-04-05 16:00): Luni e zi liberă legală');

        const messages = await queued();
        expect(messages).toHaveLength(1);
        expect(messages[0].dedupeKey).toMatch(/^class-moved:/);

        // The register can now be taken at the recovered hour — which is what makes it billable.
        const listed = await request(app.getHttpServer())
            .get(`/class-sessions?groupId=${groupId}&dateFrom=${MONDAY}&dateTo=2027-04-11`)
            .set('Authorization', admin.auth)
            .expect(200);
        expect(listed.body).toHaveLength(1);
        expect(listed.body[0]).toMatchObject({ date: TUESDAY, startTime: '16:00:00', status: 'scheduled' });
    });

    it('refuses another week — the class would change the month it is billed to', async () => {
        await createClassSession(dataSource, groupId, { date: MONDAY });

        const res = await recover({ targetDate: NEXT_MONDAY }).expect(409);
        expect(res.body.code).toBe('RESCHEDULE_OUT_OF_WEEK');
        expect((await weekRows())[0].date).toBe(MONDAY);
    });

    it('obeys the calendar on the target day too — the recovery has no side door around S2', async () => {
        await createClassSession(dataSource, groupId, { date: MONDAY });
        await closeDay(TUESDAY);

        const res = await recover().expect(409);
        expect(res.body.code).toBe('MOVED_ONTO_NON_TEACHING_DAY');
    });

    it('refuses a day the group already has a class on, and never writes a second row for the week', async () => {
        await createClassSession(dataSource, groupId, { date: MONDAY });
        await createClassSession(dataSource, groupId, { date: TUESDAY });

        const res = await recover().expect(409);
        expect(res.body.code).toBe('GROUP_ALREADY_HAS_SESSION_THAT_DAY');
        expect(await weekRows()).toHaveLength(2);
    });

    it('will not write a second row when the week’s class already sits on another day', async () => {
        // The Monday class was moved to Wednesday last week; Monday has no row and is the group's day.
        await createClassSession(dataSource, groupId, { date: WEDNESDAY });

        const before = await windows().expect(200);
        expect(before.body.blocked).toMatchObject({ code: 'GROUP_ALREADY_HAS_SESSION_THAT_WEEK' });
        expect(before.body.windows).toEqual([]);

        const res = await recover().expect(409);
        expect(res.body.code).toBe('GROUP_ALREADY_HAS_SESSION_THAT_WEEK');
        expect(await weekRows()).toHaveLength(1);
    });

    it('404s a day the group has no class on and never would have', async () => {
        const res = await recover({ date: TUESDAY, targetDate: WEDNESDAY }).expect(404);
        expect(res.body.code).toBe('CLASS_SESSION_NOT_FOUND');
        expect(await weekRows()).toEqual([]);
    });

    it('leaves a busy room out of the windows and names the free one', async () => {
        await createClassSession(dataSource, groupId, { date: MONDAY });
        // A second room at the same address, and another group teaching in the first room on
        // Tuesday at the same hour as ours.
        const second = await request(app.getHttpServer())
            .post('/rooms')
            .set('Authorization', admin.auth)
            .send({ name: 'Sala 2', locationId, capacity: 10 })
            .expect(201);
        const python = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(roomId, { name: 'Python', weekday: 2 }))
            .expect(201);
        await createClassSession(dataSource, python.body.id as number, { date: TUESDAY });

        const res = await windows().expect(200);

        const tuesdayAtFour = (res.body.windows as { date: string; startTime: string; roomId: number }[]).filter(
            (window) => window.date === TUESDAY && window.startTime === '16:00',
        );
        expect(tuesdayAtFour.map((window) => window.roomId)).toEqual([second.body.id as number]);

        // And the write agrees with the list.
        const clash = await recover().expect(409);
        expect(clash.body.code).toBe('ROOM_BUSY_AT_THAT_TIME');
        await recover({ roomId: second.body.id as number }).expect(200);
    });

    it('refuses a class that was taught, and says so before listing windows', async () => {
        const sessionId = await createClassSession(dataSource, groupId, { date: MONDAY });
        const childId = (await dataSource.query<{ id: number }[]>('SELECT "id" FROM "children" LIMIT 1'))[0].id;
        await request(app.getHttpServer())
            .post(`/attendance/session/${sessionId}`)
            .set('Authorization', admin.auth)
            .send({ childrenAttendance: [{ childId, present: true }] })
            .expect(201);

        const before = await windows().expect(200);
        expect(before.body.blocked).toMatchObject({ code: 'CLASS_SESSION_HAS_ATTENDANCE' });

        const res = await recover().expect(409);
        expect(res.body.code).toBe('CLASS_SESSION_HAS_ATTENDANCE');
    });

    it('is the office’s, not a family’s', async () => {
        await windows().set('Authorization', parent.auth).expect(403);
        await recover().set('Authorization', parent.auth).expect(403);
    });
});
