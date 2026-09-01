import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Make-up credits end to end — E12/S4.
 *
 * The unit specs hold each rule; this holds the loop, which is the only place the story is really
 * true: announce, be marked absent, earn, book, turn up, spend. Every step is a different service,
 * and the credit is the thread through them.
 */
describe('Make-up credits (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let childId: number;
    let ownGroupId: number;
    let hostGroupId: number;
    let missedSessionId: number;
    let hostSessionId: number;

    /** Tomorrow and next week, in local components — the same discipline the API uses. */
    const iso = (offsetDays: number) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.recuperari'));
        parent = await registerUser(app, 'parinte.recuperari');

        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;

        const roomId = await createRoom(app, admin, { slug: 'rec-loc', name: 'Recuperări' });
        const own = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        ownGroupId = own.body.id as number;
        await request(app.getHttpServer()).post(`/children/${childId}/groups/${ownGroupId}`).set('Authorization', admin.auth).expect(201);

        // A second group in the same room, on another weekday, to be the host.
        const host = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(roomId, { name: 'Python', weekday: 3, startTime: '18:00', endTime: '19:30' }))
            .expect(201);
        hostGroupId = host.body.id as number;

        // The missed class is today; the host class is a few days out, inside the 30-day window.
        missedSessionId = await createClassSession(dataSource, ownGroupId, { date: iso(0) });
        hostSessionId = await createClassSession(dataSource, hostGroupId, { date: iso(5) });
    });

    const announce = () =>
        request(app.getHttpServer())
            .post('/attendance/absences')
            .set('Authorization', parent.auth)
            .send({ childId, classSessionId: missedSessionId, reason: 'Răcit' });

    const mark = (sessionId: number, present: boolean) =>
        request(app.getHttpServer())
            .put(`/attendance/session/${sessionId}/child/${childId}`)
            .set('Authorization', admin.auth)
            .send({ present });

    const credits = (user: TestUser = parent) =>
        request(app.getHttpServer()).get('/attendance/make-ups').set('Authorization', user.auth);

    describe('the whole loop', () => {
        it('announce, be absent, earn, book, turn up, spend', async () => {
            await announce().expect(201);
            await mark(missedSessionId, false).expect(200);

            const earned = await credits().expect(200);
            expect(earned.body).toHaveLength(1);
            expect(earned.body[0].status).toBe('available');
            const creditId = earned.body[0].id as number;

            const options = await request(app.getHttpServer())
                .get(`/attendance/make-ups/${creditId}/options`)
                .set('Authorization', parent.auth)
                .expect(200);
            // The host group's class, and not the child's own.
            expect(options.body.map((o: { sessionId: number }) => o.sessionId)).toEqual([hostSessionId]);

            await request(app.getHttpServer())
                .put(`/attendance/make-ups/${creditId}/booking`)
                .set('Authorization', parent.auth)
                .send({ classSessionId: hostSessionId })
                .expect(200);
            expect((await credits().expect(200)).body[0].status).toBe('booked');

            // Turning up at the host class spends it, and the mark is a make-up by the rule that
            // already existed: the child is not in that group.
            await mark(hostSessionId, true).expect(200);

            const spent = await credits().expect(200);
            expect(spent.body[0].status).toBe('consumed');
            const rows = await dataSource.query<{ type: string }[]>('SELECT "type" FROM "attendances" WHERE "class_session_id" = $1', [hostSessionId]);
            expect(rows[0].type).toBe('make-up');
        });
    });

    describe('what earns one, and what does not', () => {
        it('an absence with no notice earns nothing', async () => {
            await mark(missedSessionId, false).expect(200);
            expect((await credits().expect(200)).body).toEqual([]);
        });

        it('announcing and then turning up earns nothing', async () => {
            await announce().expect(201);
            await mark(missedSessionId, true).expect(200);
            expect((await credits().expect(200)).body).toEqual([]);
        });

        it('a mark corrected back to present withdraws the credit it wrongly earned', async () => {
            await announce().expect(201);
            await mark(missedSessionId, false).expect(200);
            expect((await credits().expect(200)).body).toHaveLength(1);

            await mark(missedSessionId, true).expect(200);
            expect((await credits().expect(200)).body).toEqual([]);
        });

        it('re-marking the same absence does not stack credits', async () => {
            await announce().expect(201);
            await mark(missedSessionId, false).expect(200);
            await mark(missedSessionId, false).expect(200);
            expect((await credits().expect(200)).body).toHaveLength(1);
        });
    });

    describe('booking', () => {
        let creditId: number;

        beforeEach(async () => {
            await announce().expect(201);
            await mark(missedSessionId, false).expect(200);
            creditId = (await credits().expect(200)).body[0].id as number;
        });

        const book = (sessionId: number, user: TestUser = parent) =>
            request(app.getHttpServer())
                .put(`/attendance/make-ups/${creditId}/booking`)
                .set('Authorization', user.auth)
                .send({ classSessionId: sessionId });

        it("refuses the child's own group — that is their lesson, not a make-up", async () => {
            const ownLater = await createClassSession(dataSource, ownGroupId, { date: iso(7) });
            const res = await book(ownLater).expect(400);
            expect(res.body.code).toBe('MAKE_UP_SAME_GROUP');
        });

        it('refuses a class beyond the thirty-day window', async () => {
            const far = await createClassSession(dataSource, hostGroupId, { date: iso(45) });
            const res = await book(far).expect(409);
            expect(res.body.code).toBe('MAKE_UP_SESSION_OUT_OF_WINDOW');
        });

        it('refuses a cancelled class', async () => {
            const off = await createClassSession(dataSource, hostGroupId, { date: iso(6), status: 'cancelled' });
            const res = await book(off).expect(409);
            expect(res.body.code).toBe('CLASS_SESSION_CANCELLED');
        });

        it("refuses another family's credit as a 404", async () => {
            const other = await registerUser(app, 'alt.parinte.rec');
            await book(hostSessionId, other).expect(404);
        });

        it('cancelling the booking leaves the credit available again', async () => {
            await book(hostSessionId).expect(200);
            await request(app.getHttpServer())
                .delete(`/attendance/make-ups/${creditId}/booking`)
                .set('Authorization', parent.auth)
                .expect(200);
            expect((await credits().expect(200)).body[0].status).toBe('available');
        });

        it('a booked class the child misses spends nothing — the credit survives', async () => {
            await book(hostSessionId).expect(200);
            await mark(hostSessionId, false).expect(200);
            // Marked absent at the host class: they did not come, so the credit is still theirs.
            expect((await credits().expect(200)).body[0].status).toBe('booked');
        });
    });

    describe('who sees what', () => {
        it('a parent sees only their own credits; an admin sees the school', async () => {
            await announce().expect(201);
            await mark(missedSessionId, false).expect(200);

            const other = await registerUser(app, 'alta.familie.rec');
            expect((await credits(other).expect(200)).body).toEqual([]);
            expect((await credits(admin).expect(200)).body).toHaveLength(1);
        });
    });
});
