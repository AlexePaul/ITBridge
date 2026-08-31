import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The school calendar, against a real database — E12/S2.
 *
 * The unit spec checks the arithmetic of expanding a period into days. This checks the two things
 * only a real database shows: that adding a period actually cancels the rows the timetable already
 * holds, and that generation afterwards refuses to put them back. Between them they are the whole
 * point of the story — a calendar nothing reads is a calendar nobody maintains.
 *
 * The dates below all sit in 2027 so they cannot collide with the fixtures other suites write.
 */
describe('Non-teaching periods (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;
    let roomId: number;

    /** 2027-03-01 is a Monday, which is `groupBody`'s weekday. */
    const FIRST_MONDAY = '2027-03-01';
    const SECOND_MONDAY = '2027-03-08';

    beforeAll(async () => {
        const created = await createTestApp();
        app = created.app;
        dataSource = created.dataSource;
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        const first = await registerUser(app, 'admin_calendar');
        admin = await promoteToAdmin(app, dataSource, first);
        parent = await registerUser(app, 'parinte_calendar');

        roomId = await createRoom(app, admin, { slug: 'calendar-loc', name: 'Calendar' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
    });

    const addPeriod = (body: Record<string, unknown>, auth = admin.auth) =>
        request(app.getHttpServer()).post('/class-sessions/non-teaching').set('Authorization', auth).send(body);

    const statusOf = async (sessionId: number): Promise<{ status: string; notes: string | null }> => {
        const rows = await dataSource.query<{ status: string; notes: string | null }[]>('SELECT "status", "notes" FROM "class_sessions" WHERE "id" = $1', [
            sessionId,
        ]);
        return rows[0];
    };

    describe('adding a period', () => {
        it('cancels the classes already in the interval, and says how many', async () => {
            const inside = await createClassSession(dataSource, groupId, { date: FIRST_MONDAY });
            const outside = await createClassSession(dataSource, groupId, { date: SECOND_MONDAY });

            const res = await addPeriod({ name: 'Vacanța de primăvară', startDate: FIRST_MONDAY, endDate: '2027-03-05' }).expect(201);

            expect(res.body.cancelled).toBe(1);
            expect((await statusOf(inside)).status).toBe('cancelled');
            expect((await statusOf(outside)).status).toBe('scheduled');
        });

        it('names the period in the cancelled class, so the reason survives in the timetable', async () => {
            const inside = await createClassSession(dataSource, groupId, { date: FIRST_MONDAY });

            await addPeriod({ name: 'Vacanța de primăvară', startDate: FIRST_MONDAY, endDate: '2027-03-05' }).expect(201);

            expect((await statusOf(inside)).notes).toContain('Vacanța de primăvară');
        });

        it('cancels rather than deletes: the row is still there', async () => {
            const inside = await createClassSession(dataSource, groupId, { date: FIRST_MONDAY });

            await addPeriod({ name: 'Vacanță', startDate: FIRST_MONDAY, endDate: FIRST_MONDAY }).expect(201);

            // A class that was on the timetable and did not happen is a fact about the term.
            const rows = await dataSource.query<unknown[]>('SELECT 1 FROM "class_sessions" WHERE "id" = $1', [inside]);
            expect(rows).toHaveLength(1);
        });

        it('leaves a class somebody already cancelled exactly as it was', async () => {
            const already = await createClassSession(dataSource, groupId, { date: FIRST_MONDAY, status: 'cancelled' });
            await dataSource.query('UPDATE "class_sessions" SET "notes" = $2 WHERE "id" = $1', [already, 'Anulată: profesor bolnav']);

            const res = await addPeriod({ name: 'Vacanță', startDate: FIRST_MONDAY, endDate: FIRST_MONDAY }).expect(201);

            expect(res.body.cancelled).toBe(0);
            // Overwriting the note would lose why it was really off.
            expect((await statusOf(already)).notes).toBe('Anulată: profesor bolnav');
        });

        it('refuses an interval that overlaps one already there, naming it', async () => {
            await addPeriod({ name: 'Vacanța de primăvară', startDate: FIRST_MONDAY, endDate: '2027-03-12' }).expect(201);

            const res = await addPeriod({ name: 'Altceva', startDate: '2027-03-10', endDate: '2027-03-20' }).expect(409);

            expect(res.body.code).toBe('PERIOD_OVERLAPS');
            expect(res.body.message).toContain('Vacanța de primăvară');
        });

        it('refuses an interval that ends before it starts', async () => {
            const res = await addPeriod({ name: 'Tastat greșit', startDate: '2027-03-10', endDate: '2027-03-01' }).expect(400);
            expect(res.body.code).toBe('PERIOD_ENDS_BEFORE_IT_STARTS');
        });

        it('accepts a single day, with both dates the same', async () => {
            await addPeriod({ name: '1 Mai', startDate: '2027-05-01', endDate: '2027-05-01' }).expect(201);

            const res = await request(app.getHttpServer()).get('/class-sessions/non-teaching').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].startDate).toBe('2027-05-01');
        });
    });

    describe('the impact preview', () => {
        it('reports what would be cancelled without writing anything', async () => {
            const inside = await createClassSession(dataSource, groupId, { date: FIRST_MONDAY });

            const res = await request(app.getHttpServer())
                .get('/class-sessions/non-teaching/impact')
                .query({ startDate: FIRST_MONDAY, endDate: '2027-03-05' })
                .set('Authorization', admin.auth)
                .expect(200);

            expect(res.body.affected).toHaveLength(1);
            expect(res.body.byGroup[0].count).toBe(1);
            expect(res.body.byGroup[0].groupName).toBe('Scratch Începători');
            // Preview means preview.
            expect((await statusOf(inside)).status).toBe('scheduled');
        });
    });

    describe('the timetable obeys the calendar', () => {
        it('skips the closed days when generating, and reports the count', async () => {
            await addPeriod({ name: 'Vacanța de primăvară', startDate: FIRST_MONDAY, endDate: '2027-03-14' }).expect(201);

            const res = await request(app.getHttpServer())
                .post('/class-sessions/generate')
                .set('Authorization', admin.auth)
                .send({ groupId, from: FIRST_MONDAY, weeks: 4 })
                .expect(201);

            // Four Mondays in the horizon, the first two inside the holiday.
            expect(res.body.created).toBe(2);
            expect(res.body.skipped).toBe(2);

            const dates = await dataSource.query<{ date: string }[]>('SELECT "date"::text FROM "class_sessions" ORDER BY "date"');
            expect(dates.map((row) => row.date)).toEqual(['2027-03-15', '2027-03-22']);
        });

        it('does not put back a class the calendar cancelled, however many times generation runs', async () => {
            await request(app.getHttpServer())
                .post('/class-sessions/generate')
                .set('Authorization', admin.auth)
                .send({ groupId, from: FIRST_MONDAY, weeks: 2 })
                .expect(201);
            await addPeriod({ name: 'Vacanță', startDate: FIRST_MONDAY, endDate: FIRST_MONDAY }).expect(201);

            await request(app.getHttpServer())
                .post('/class-sessions/generate')
                .set('Authorization', admin.auth)
                .send({ groupId, from: FIRST_MONDAY, weeks: 2 })
                .expect(201);

            const rows = await dataSource.query<{ status: string }[]>('SELECT "status" FROM "class_sessions" WHERE "date" = $1', [FIRST_MONDAY]);
            expect(rows).toEqual([{ status: 'cancelled' }]);
        });

        it('a holiday at one address does not empty the other one', async () => {
            const otherRoom = await createRoom(app, admin, { slug: 'straulesti-cal', name: 'Străulești', roomName: 'Sala N' });
            const otherGroup = await request(app.getHttpServer())
                .post('/groups')
                .set('Authorization', admin.auth)
                .send(groupBody(otherRoom, { name: 'Python' }))
                .expect(201);

            const locationId = (await dataSource.query<{ location_id: number }[]>('SELECT "location_id" FROM "rooms" WHERE "id" = $1', [otherRoom]))[0]
                .location_id;

            await addPeriod({ name: 'Lucrări în sală', startDate: FIRST_MONDAY, endDate: '2027-03-14', locationId }).expect(201);

            const mine = await request(app.getHttpServer())
                .post('/class-sessions/generate')
                .set('Authorization', admin.auth)
                .send({ groupId, from: FIRST_MONDAY, weeks: 4 })
                .expect(201);
            const theirs = await request(app.getHttpServer())
                .post('/class-sessions/generate')
                .set('Authorization', admin.auth)
                .send({ groupId: otherGroup.body.id as number, from: FIRST_MONDAY, weeks: 4 })
                .expect(201);

            expect(mine.body.skipped).toBe(0);
            expect(theirs.body.skipped).toBe(2);
        });
    });

    describe('removing a period', () => {
        it('leaves the classes it cancelled cancelled', async () => {
            const inside = await createClassSession(dataSource, groupId, { date: FIRST_MONDAY });
            const created = await addPeriod({ name: 'Vacanță', startDate: FIRST_MONDAY, endDate: FIRST_MONDAY }).expect(201);

            await request(app.getHttpServer())
                .delete(`/class-sessions/non-teaching/${created.body.period.id as number}`)
                .set('Authorization', admin.auth)
                .expect(200);

            // Reinstating automatically would be a guess: this and "the teacher was ill" are
            // indistinguishable afterwards, and the school may have rescheduled around both.
            expect((await statusOf(inside)).status).toBe('cancelled');
        });

        it('404s on an interval that is not there', async () => {
            await request(app.getHttpServer()).delete('/class-sessions/non-teaching/99999').set('Authorization', admin.auth).expect(404);
        });
    });

    describe('who may touch the calendar', () => {
        it('refuses a parent the list', async () => {
            await request(app.getHttpServer()).get('/class-sessions/non-teaching').set('Authorization', parent.auth).expect(403);
        });

        it('refuses a parent the write, so nobody else can cancel a term', async () => {
            await addPeriod({ name: 'Vacanță', startDate: FIRST_MONDAY, endDate: FIRST_MONDAY }, parent.auth).expect(403);
        });

        it('refuses an anonymous caller', async () => {
            await request(app.getHttpServer()).get('/class-sessions/non-teaching').expect(401);
        });
    });
});
