import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Calling a class off, against a real database — E12/S5.
 *
 * The unit specs hold the refusal order and the wording; this holds the two things only Postgres
 * shows: that the note to every family and the cancellation are one unit of work, and that the
 * make-up credits land as rows the booking screen can then read.
 *
 * **One message per parent, not per child.** The fixture gives one family two children in the same
 * group precisely so that the count can be wrong if the grouping is.
 */
describe('Cancelling a class session (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let groupId: number;
    let sessionId: number;
    let childIds: number[];

    /** A Monday, which is `groupBody`'s weekday. Far enough out to never be "today". */
    const MONDAY = '2027-04-05';

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.anulari'));
        parent = await registerUser(app, 'parinte.anulari');

        const profileId = await ownProfileId(app, parent);
        childIds = [];
        for (const firstName of ['Ana', 'Bogdan']) {
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', parent.auth)
                .send({ firstName, lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);
            childIds.push(child.body.id as number);
        }

        const roomId = await createRoom(app, admin, { slug: 'anul-loc', name: 'Anulări' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
        for (const childId of childIds) {
            await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);
        }

        sessionId = await createClassSession(dataSource, groupId, { date: MONDAY });
    });

    const cancel = (body: Record<string, unknown> = {}) =>
        request(app.getHttpServer())
            .put(`/class-sessions/${sessionId}/cancel`)
            .set('Authorization', admin.auth)
            .send({ reason: 'Profesorul este bolnav', ...body });

    /**
     * Only the messages this story writes. Registering the fixture's two accounts queues four of
     * its own — a confirmation and an "somebody is waiting" each — and counting those would make
     * "one message per family" pass for the wrong reason.
     */
    const queued = () =>
        dataSource.query<{ to: string; subject: string; bodyText: string }[]>(
            `SELECT "to", "subject", "bodyText" FROM "outbox" WHERE "dedupeKey" LIKE 'class-%' ORDER BY id ASC`,
        );

    const placements = () =>
        dataSource.query<{ child_id: number; replacement_session_id: number | null }[]>('SELECT "child_id", "replacement_session_id" FROM "absence_notices"');

    it('writes one message to the family, not one per child', async () => {
        await cancel().expect(200);

        const messages = await queued();
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe(`${parent.username}@example.com`);
        expect(messages[0].subject).toContain('anulată');
        expect(messages[0].bodyText).toContain('Profesorul este bolnav');
    });

    /**
     * Cancelling promises the group nothing, because there is nothing left to promise — E12/S4.
     *
     * The flag that used to be here handed every child a credit for the hour. What the family is
     * told instead is the arithmetic of E15/S9: a class with no register never happened, so nobody
     * is billed for it. If the week still has an hour that fits, the office moves the child into it,
     * and that is a placement somebody makes rather than a checkbox somebody ticks while cancelling.
     */
    it('tells the group the hour is simply not charged for', async () => {
        await cancel().expect(200);

        const [message] = await queued();
        expect(message.bodyText).toContain('nu se facturează');
    });

    it('refuses the flag that used to grant credits, rather than ignoring it', async () => {
        // `forbidNonWhitelisted`: a client still sending the old field learns it is gone.
        await cancel({ grantMakeUpCredits: true }).expect(400);
    });

    it('refuses a second cancellation, and writes nothing the second time', async () => {
        await cancel().expect(200);

        const res = await cancel().expect(409);
        expect(res.body.code).toBe('CLASS_SESSION_ALREADY_CANCELLED');
        expect(await queued()).toHaveLength(1);
    });

    it('a class with a register against it is neither cancelled nor announced', async () => {
        await request(app.getHttpServer())
            .put(`/attendance/session/${sessionId}/child/${childIds[0]}`)
            .set('Authorization', admin.auth)
            .send({ present: true })
            .expect(200);

        const res = await cancel().expect(409);

        expect(res.body.code).toBe('CLASS_SESSION_HAS_ATTENDANCE');
        expect(await queued()).toHaveLength(0);
        const rows = await dataSource.query<{ status: string }[]>('SELECT "status" FROM "class_sessions" WHERE "id" = $1', [sessionId]);
        expect(rows[0].status).toBe('scheduled');
    });

    /**
     * Cancelled by mistake, reinstated, then really cancelled — all before dinner. The family last
     * heard the class was on, so the second cancellation has to reach them; a key on the day alone
     * would have been refused by the unique index.
     */
    it('announces a second cancellation on the same day', async () => {
        await cancel().expect(200);
        await request(app.getHttpServer()).put(`/class-sessions/${sessionId}/reinstate`).set('Authorization', admin.auth).expect(200);
        await cancel({ reason: 'Chiar este bolnav' }).expect(200);

        const messages = await queued();
        expect(messages.map((message) => message.subject.includes('anulată'))).toEqual([true, false, true]);
        expect(messages[2].bodyText).toContain('Chiar este bolnav');
    });

    /**
     * A child from another group had been moved into this class for the week (E12/S4). Their
     * family is not in the group, but they were coming — so they hear the class is off, in their
     * own words, and the placement is cleared while the absence stays a fact.
     */
    it('releases a child moved into the class and tells that family too', async () => {
        const visitor = await registerUser(app, 'parinte.vizita');
        const visitorChild = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', visitor.auth)
            .send({ firstName: 'Carmen', lastName: 'Ion', birthDate: '2016-06-06', parentId: await ownProfileId(app, visitor) })
            .expect(201);
        const other = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(
                groupBody((await dataSource.query<{ room_id: number }[]>('SELECT room_id FROM groups WHERE id = $1', [groupId]))[0].room_id, {
                    name: 'Python',
                    startTime: '18:00',
                    endTime: '19:30',
                }),
            )
            .expect(201);
        // The class they miss is in the same week as the one they were moved into: MONDAY is
        // 5 April 2027, so this Wednesday belongs to the same week.
        const missed = await createClassSession(dataSource, other.body.id as number, { date: '2027-04-07' });
        await dataSource.query(
            'INSERT INTO absence_notices (child_id, class_session_id, reason, "inTime", replacement_session_id) VALUES ($1, $2, $3, $4, $5)',
            [visitorChild.body.id, missed, 'Răcit', true, sessionId],
        );

        await cancel().expect(200);

        const messages = await queued();
        expect(messages).toHaveLength(2);
        const visitorMail = messages.find((message) => message.to === `${visitor.username}@example.com`)!;
        expect(visitorMail.bodyText).toContain('mutasem');
        // The move is let go of; the absence itself is untouched, and the child goes back on the
        // office's list of those still to place.
        expect(await placements()).toEqual([{ child_id: visitorChild.body.id, replacement_session_id: null }]);
    });

    it('reinstating tells the families the class is on again', async () => {
        await cancel().expect(200);

        await request(app.getHttpServer()).put(`/class-sessions/${sessionId}/reinstate`).set('Authorization', admin.auth).expect(200);

        const messages = await queued();
        expect(messages).toHaveLength(2);
        expect(messages[1].subject).toContain('se ține totuși');
    });

    it('moving tells them where it went', async () => {
        await request(app.getHttpServer())
            .put(`/class-sessions/${sessionId}/move`)
            .set('Authorization', admin.auth)
            .send({ date: '2027-04-06', reason: 'Sala este ocupată' })
            .expect(200);

        const [message] = await queued();
        expect(message.bodyText).toContain('5 aprilie');
        expect(message.bodyText).toContain('6 aprilie');
    });
});
