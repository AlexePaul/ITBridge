import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Moving a child to another group for one week, end to end — E12/S4.
 *
 * The unit specs hold each rule; this holds the story, which is the only place it is really true:
 * a family announces, the office looks at what that week has, moves the child, and the family is
 * written to. Every step is a different service, and the notice is the thread through them.
 *
 * **Everything is anchored to a week that has not opened.** Both rules of E12 are about weeks: the
 * notice is due by Monday noon *of the class's own week*, and the move has to land inside that same
 * week. Fixtures counted as "today plus n days" are in time on a Sunday and hopeless on a Wednesday,
 * so the whole suite would pass or fail on the day CI happened to run.
 */
describe('Temporary group moves (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let childId: number;
    let ownGroupId: number;
    let hostGroupId: number;
    let missedSessionId: number;
    let hostSessionId: number;
    let noticeId: number;

    /** A day of **next** week, counted from its Monday, in local components. */
    const iso = (daysAfterNextMonday: number) => {
        const d = new Date();
        // `getDay()` is 0 on Sunday, whose week opened six days ago: its next Monday is tomorrow.
        d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 8 - d.getDay()) + daysAfterNextMonday);
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
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.mutari'));
        parent = await registerUser(app, 'parinte.mutari');

        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;

        const roomId = await createRoom(app, admin, { slug: 'mutari-loc', name: 'Mutări' });
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

        missedSessionId = await createClassSession(dataSource, ownGroupId, { date: iso(0) });
        hostSessionId = await createClassSession(dataSource, hostGroupId, { date: iso(3) });

        // The office records it, not the family — E12/S3. Parents ring, message or email.
        const announced = await request(app.getHttpServer())
            .post('/attendance/absences')
            .set('Authorization', admin.auth)
            .send({ childId, classSessionId: missedSessionId, reason: 'Răcit' })
            .expect(201);
        noticeId = announced.body.id as number;
    });

    const options = (user: TestUser = admin) =>
        request(app.getHttpServer()).get(`/attendance/absences/${noticeId}/replacement-options`).set('Authorization', user.auth);

    const place = (sessionId: number, user: TestUser = admin) =>
        request(app.getHttpServer()).put(`/attendance/absences/${noticeId}/replacement`).set('Authorization', user.auth).send({ classSessionId: sessionId });

    const mailTo = (address: string) =>
        dataSource.query<{ subject: string; bodyText: string }[]>('SELECT "subject", "bodyText" FROM "outbox" WHERE "to" = $1 ORDER BY id DESC', [address]);

    const placedSessionId = async () => {
        const rows = await dataSource.query<{ id: number | null }[]>('SELECT "replacement_session_id" AS id FROM "absence_notices" WHERE "id" = $1', [
            noticeId,
        ]);
        return rows[0]?.id ?? null;
    };

    describe('the whole story', () => {
        it('announce, be offered the week, be moved, and be told where', async () => {
            const offered = await options().expect(200);
            // The host group's class that week, and not the child's own.
            expect(offered.body.map((option: { sessionId: number }) => option.sessionId)).toEqual([hostSessionId]);

            await place(hostSessionId).expect(200);

            expect(await placedSessionId()).toBe(hostSessionId);
            const mail = await mailTo('parinte.mutari@example.com');
            expect(mail[0].subject).toContain('Ana');
            expect(mail[0].bodyText).toContain('Python');
            expect(mail[0].bodyText).toContain('/user/absente');
        });

        it('writes to the family once, however many times the same move is recorded', async () => {
            await place(hostSessionId).expect(200);
            await place(hostSessionId).expect(200);

            const mail = await mailTo('parinte.mutari@example.com');
            expect(mail.filter((row) => row.subject.includes('Ana')).length).toBe(1);
        });

        it('the family reads the move from their own absences list — group, day, hour and room', async () => {
            // This is the payload `/user/absente` and the Acasă to-do render from. Without the
            // replacement joined in, both would read every notice as "not placed yet".
            await place(hostSessionId).expect(200);

            const mine = await request(app.getHttpServer()).get('/attendance/absences').set('Authorization', parent.auth).expect(200);
            expect(mine.body).toHaveLength(1);
            expect(mine.body[0].replacementSession).toMatchObject({
                id: hostSessionId,
                date: iso(3),
                startTime: '18:00:00',
                group: { name: 'Python' },
            });
            expect(mine.body[0].replacementSession.room.location.name).toBe('Mutări');
        });

        it('writes again when the child is moved somewhere else — that is a new thing to know', async () => {
            const second = await createClassSession(dataSource, hostGroupId, { date: iso(5) });

            await place(hostSessionId).expect(200);
            await place(second).expect(200);

            expect(await placedSessionId()).toBe(second);
            expect((await mailTo('parinte.mutari@example.com')).filter((row) => row.subject.includes('Ana')).length).toBe(2);
        });

        it('clearing the move says nothing to anybody — the absence stands', async () => {
            await place(hostSessionId).expect(200);

            await request(app.getHttpServer()).delete(`/attendance/absences/${noticeId}/replacement`).set('Authorization', admin.auth).expect(200);

            expect(await placedSessionId()).toBeNull();
            // Still the one message, the one announcing the move. Clearing it writes nothing.
            expect((await mailTo('parinte.mutari@example.com')).filter((row) => row.subject.includes('Ana')).length).toBe(1);
        });
    });

    describe('what the week allows', () => {
        it('refuses a class in the following week', async () => {
            const nextWeek = await createClassSession(dataSource, hostGroupId, { date: iso(7) });
            const res = await place(nextWeek).expect(409);
            expect(res.body.code).toBe('REPLACEMENT_OUT_OF_WEEK');
        });

        it('accepts a class earlier in the same week — the office plans on Monday', async () => {
            // The missed class is the Monday; this is the Tuesday before Wednesday's host class.
            const earlier = await createClassSession(dataSource, hostGroupId, { date: iso(1) });
            await place(earlier).expect(200);
            expect(await placedSessionId()).toBe(earlier);
        });

        it("refuses the child's own group — that is their lesson, not a move", async () => {
            const ownLater = await createClassSession(dataSource, ownGroupId, { date: iso(4) });
            const res = await place(ownLater).expect(400);
            expect(res.body.code).toBe('REPLACEMENT_SAME_GROUP');
        });

        it('refuses a cancelled class', async () => {
            const off = await createClassSession(dataSource, hostGroupId, { date: iso(4), status: 'cancelled' });
            const res = await place(off).expect(409);
            expect(res.body.code).toBe('CLASS_SESSION_CANCELLED');
        });

        it('leaves out of the options every class the rules would refuse', async () => {
            await createClassSession(dataSource, hostGroupId, { date: iso(7) });
            await createClassSession(dataSource, hostGroupId, { date: iso(4), status: 'cancelled' });
            await createClassSession(dataSource, ownGroupId, { date: iso(4) });

            const offered = await options().expect(200);
            expect(offered.body.map((option: { sessionId: number }) => option.sessionId)).toEqual([hostSessionId]);
        });
    });

    describe('who may do it', () => {
        it('a parent cannot move their own child — the office decides', async () => {
            await place(hostSessionId, parent).expect(403);
            await options(parent).expect(403);
            expect(await placedSessionId()).toBeNull();
        });

        it('the office worklist is this week’s announced absences nobody has placed', async () => {
            const before = await request(app.getHttpServer()).get('/attendance/replacements/unplaced').set('Authorization', admin.auth).expect(200);
            expect(before.body.map((notice: { id: number }) => notice.id)).toContain(noticeId);

            await place(hostSessionId).expect(200);

            const after = await request(app.getHttpServer()).get('/attendance/replacements/unplaced').set('Authorization', admin.auth).expect(200);
            expect(after.body.map((notice: { id: number }) => notice.id)).not.toContain(noticeId);
        });

        it('a parent cannot read the worklist at all', async () => {
            await request(app.getHttpServer()).get('/attendance/replacements/unplaced').set('Authorization', parent.auth).expect(403);
        });
    });

    describe('the seat the visitor takes', () => {
        it('counts against the host class, so a full hour is not offered twice', async () => {
            // A group of one: the visitor fills it, and the next child has nowhere to go.
            const small = await request(app.getHttpServer())
                .post('/groups')
                .set('Authorization', admin.auth)
                .send(groupBody(await createRoom(app, admin, { slug: 'mic-loc', name: 'Mic' }), { name: 'Micuț', weekday: 4, capacity: 1 }))
                .expect(201);
            const tightSession = await createClassSession(dataSource, small.body.id as number, { date: iso(4) });

            await place(tightSession).expect(200);
            // Recording the same move again is a no-op, not a refusal: the child already holds the
            // one chair, and must not be counted against themselves.
            await place(tightSession).expect(200);

            // A second family, announcing the same week, is not offered the hour that is now taken.
            const other = await registerUser(app, 'alta.familie.mutari');
            const otherProfile = await ownProfileId(app, other);
            const otherChild = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', other.auth)
                .send({ firstName: 'Radu', lastName: 'Ion', birthDate: '2016-01-01', parentId: otherProfile })
                .expect(201);
            await request(app.getHttpServer()).post(`/children/${otherChild.body.id}/groups/${ownGroupId}`).set('Authorization', admin.auth).expect(201);
            const otherNotice = await request(app.getHttpServer())
                .post('/attendance/absences')
                .set('Authorization', admin.auth)
                .send({ childId: otherChild.body.id, classSessionId: missedSessionId, reason: 'Plecăm din oraș' })
                .expect(201);

            const offered = await request(app.getHttpServer())
                .get(`/attendance/absences/${otherNotice.body.id}/replacement-options`)
                .set('Authorization', admin.auth)
                .expect(200);
            expect(offered.body.map((option: { sessionId: number }) => option.sessionId)).not.toContain(tightSession);
        });
    });
});
