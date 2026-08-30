import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Who may read the timetable, against a real database.
 *
 * The unit spec checks the *shape* of the query — which `andWhere` were added. This checks the
 * effect, which is the only thing a parent experiences: two families, two groups, and neither
 * parent may see the other group's classes. A restriction that is composed correctly but joins the
 * wrong way round still passes the unit spec and fails here.
 *
 * `GET /class-sessions` carries no attendance marks, so the leak this prevents is not a child's
 * record; it is the school's timetable — when and where other people's children are, by name of
 * group, room and address. That is enough to be worth a query of its own.
 */
describe('Class session visibility (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let bogdan: TestUser;

    let scratchId: number;
    let pythonId: number;

    const CLASS_DAY = '2026-03-10';

    interface SessionRow {
        id: number;
        group: { id: number; name: string };
        date: string;
        hasAttendance: boolean;
    }

    async function listAs(user: TestUser, query = ''): Promise<SessionRow[]> {
        const res = await request(app.getHttpServer()).get(`/class-sessions${query}`).set('Authorization', user.auth).expect(200);
        return res.body as SessionRow[];
    }

    /** Registers a parent, gives them a profile and one child, and enrols the child in a group. */
    async function enrolFamily(username: string, childName: string, _phone: string, groupId: number): Promise<TestUser> {
        const parent = await registerUser(app, username);
        // The profile arrived with the registration; `_phone` is left in the signature so the call
        // sites still read as "two distinct families".
        const parentId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId, firstName: childName, lastName: 'Pop', birthDate: '2015-05-05' })
            .expect(201);
        await request(app.getHttpServer())
            .post(`/children/${child.body.id as number}/groups/${groupId}`)
            .set('Authorization', admin.auth)
            .expect(201);
        return parent;
    }

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);

        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));

        // Two groups in the same room at different hours — the room is what cannot be in two places
        // at once, so this is the arrangement the schedule constraint allows.
        const roomId = await createRoom(app, admin);
        const scratch = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        const python = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(roomId, { name: 'Python Avansați', startTime: '18:00', endTime: '19:30' }))
            .expect(201);
        scratchId = scratch.body.id as number;
        pythonId = python.body.id as number;

        ana = await enrolFamily('ana', 'Maria', '+40700000001', scratchId);
        bogdan = await enrolFamily('bogdan', 'Radu', '+40700000002', pythonId);

        await createClassSession(dataSource, scratchId, { date: CLASS_DAY });
        await createClassSession(dataSource, pythonId, { date: CLASS_DAY });
    });

    it('shows an admin every group in the school', async () => {
        const rows = await listAs(admin);

        expect(rows.map((row) => row.group.id).sort()).toEqual([scratchId, pythonId].sort());
    });

    it('shows a parent only the group their own child is in', async () => {
        const rows = await listAs(ana);

        expect(rows).toHaveLength(1);
        expect(rows[0].group.id).toBe(scratchId);
    });

    it('shows the other parent the other group, and nothing of the first', async () => {
        const rows = await listAs(bogdan);

        expect(rows).toHaveLength(1);
        expect(rows[0].group.id).toBe(pythonId);
    });

    // The two lists must not overlap at all. Asserting on ids rather than on lengths, because a
    // narrowing that returned everybody's sessions to everybody would still give each of them one
    // row if each group had one session and the counts were all that was checked.
    it('gives the two families disjoint lists', async () => {
        const anaIds = (await listAs(ana)).map((row) => row.id);
        const bogdanIds = (await listAs(bogdan)).map((row) => row.id);

        expect(anaIds.filter((id) => bogdanIds.includes(id))).toEqual([]);
    });

    // A group id in the query string is a request, not a claim. The answer is an empty list rather
    // than a 403: the rows are not refused, they are not this parent's rows.
    it('returns nothing when a parent asks for a group that is not theirs', async () => {
        expect(await listAs(ana, `?groupId=${pythonId}`)).toEqual([]);
    });

    it('shows a parent whose child is in no group nothing at all', async () => {
        const carmen = await registerUser(app, 'carmen');
        await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', carmen.auth)
            .send({ parentId: await ownProfileId(app, carmen), firstName: 'Vlad', lastName: 'Ion', birthDate: '2016-01-01' })
            .expect(201);

        expect(await listAs(carmen)).toEqual([]);
    });

    // The narrowing joins through the children of the group, so a group of three fans one session
    // row out into three. `getMany` folds them back by id — this is the test that says so, because
    // the day it stops being true a parent sees the same class three times in their calendar.
    it('lists a session once however many children are in the group', async () => {
        const daniela = await enrolFamily('daniela', 'Andrei', '+40700000004', scratchId);
        await enrolFamily('elena', 'Sofia', '+40700000005', scratchId);

        expect(await listAs(ana)).toHaveLength(1);
        expect(await listAs(daniela)).toHaveLength(1);
    });

    it('still refuses an unauthenticated caller', async () => {
        await request(app.getHttpServer()).get('/class-sessions').expect(401);
    });

    // The filters have to survive the narrowing, not be replaced by it — and vice versa.
    it('applies the date filter on top of the parent restriction', async () => {
        await createClassSession(dataSource, scratchId, { date: '2026-03-17' });

        const rows = await listAs(ana, `?dateFrom=${CLASS_DAY}&dateTo=${CLASS_DAY}`);

        expect(rows).toHaveLength(1);
        expect(rows[0].date).toBe(CLASS_DAY);
    });

    // The wire shape the timetable screen reads. Named here so a change to it breaks a test rather
    // than a calendar: `date` is a plain ISO day, `hasAttendance` is a boolean about the class, and
    // the individual marks are not on this endpoint at all.
    it('returns the session with its group, room and location, and no attendance marks', async () => {
        const [row] = await listAs(ana);

        expect(row).toMatchObject({
            id: expect.any(Number) as number,
            date: CLASS_DAY,
            startTime: '16:00:00',
            endTime: '17:30:00',
            status: 'scheduled',
            notes: null,
            hasAttendance: false,
            group: { id: scratchId, name: 'Scratch Începători', weekday: 1 },
            room: { id: expect.any(Number) as number, name: 'Sala 1', location: { name: 'Drumul Taberei' } },
        });
        expect(row).not.toHaveProperty('attendances');
        expect(row).not.toHaveProperty('attendanceCount');
    });
});
