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

    const credits = () =>
        dataSource.query<{ child_id: number; expires_on: string }[]>('SELECT "child_id", "expiresOn"::text AS expires_on FROM "make_up_credits"');

    it('writes one message to the family, not one per child', async () => {
        await cancel().expect(200);

        const messages = await queued();
        expect(messages).toHaveLength(1);
        expect(messages[0].to).toBe(`${parent.username}@example.com`);
        expect(messages[0].subject).toContain('anulată');
        expect(messages[0].bodyText).toContain('Profesorul este bolnav');
    });

    // The default. The hour is not charged for either way, so silence about a make-up is the
    // message that cannot promise something the school did not decide to give.
    it('grants no make-up credits unless asked', async () => {
        await cancel().expect(200);

        expect(await credits()).toHaveLength(0);
        const [message] = await queued();
        expect(message.bodyText).not.toContain('recuperare');
    });

    it('gives every child in the group the hour back when asked, dated from the class', async () => {
        await cancel({ grantMakeUpCredits: true }).expect(200);

        const rows = await credits();
        expect(rows.map((row) => row.child_id).sort((a, b) => a - b)).toEqual([...childIds].sort((a, b) => a - b));
        // Thirty days from the class that did not happen.
        expect(rows[0].expires_on).toBe('2027-05-05');

        const [message] = await queued();
        expect(message.bodyText).toContain('recuperare');
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
