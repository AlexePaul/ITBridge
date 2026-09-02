import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { DEDUPE_PREFIX, LateRegisterJob } from 'src/modules/class-session/late-register.job';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The fifteen-minute alert, against a real database.
 *
 * The unit spec proves what the job does with an answer; this proves the two things a mock cannot:
 * that the SQL behind "unmarked" distinguishes a marked class and a cancelled one from an empty
 * register, and that the `dedupeKey` unique index — not a check in code — is what refuses the second
 * alert for the same class and lets a moved class through.
 *
 * Driven through `checkAt(now)`, never through the timer: the tick is off under `NODE_ENV=test`.
 */
describe('Fifteen-minute unmarked-register alert (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let job: LateRegisterJob;

    let admin: TestUser;
    let parent: TestUser;
    let childId: number;
    let scratchId: number;
    let pythonId: number;

    /** A Tuesday in March: EET, so 16:20 at the school is 14:20Z. */
    const DAY = '2026-03-10';
    const AT_16_20 = new Date('2026-03-10T14:20:00Z');
    const AT_18_20 = new Date('2026-03-10T16:20:00Z');

    /** The alert's own rows only: registration writes confirmation mail into the same table. */
    async function outboxRows(): Promise<OutboxMessage[]> {
        return dataSource
            .getRepository(OutboxMessage)
            .createQueryBuilder('message')
            .where('message."dedupeKey" LIKE :prefix', { prefix: `${DEDUPE_PREFIX}%` })
            .orderBy('message.id', 'ASC')
            .getMany();
    }

    async function markAttendance(classSessionId: number): Promise<void> {
        await request(app.getHttpServer())
            .post(`/attendance/session/${classSessionId}`)
            .set('Authorization', admin.auth)
            .send({ childrenAttendance: [{ childId, present: true }] })
            .expect(201);
    }

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
        job = app.get(LateRegisterJob);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);

        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        parent = await registerUser(app, 'ana');

        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName: 'Maria', lastName: 'Pop', birthDate: '2015-05-05' })
            .expect(201);
        childId = child.body.id as number;

        const roomId = await createRoom(app, admin);
        const scratch = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        const python = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(roomId, { name: 'Python Avansați', startTime: '18:00', endTime: '19:30' }))
            .expect(201);
        scratchId = scratch.body.id as number;
        pythonId = python.body.id as number;

        await dataSource.query('UPDATE children SET group_id = $1 WHERE id = $2', [scratchId, childId]);
    });

    it('alerts the office about a class twenty minutes in with no register, naming group, hour and room', async () => {
        const sessionId = await createClassSession(dataSource, scratchId, { date: DAY });

        const result = await job.checkAt(AT_16_20);

        expect(result).toEqual({ checkedAt: '2026-03-10T16:20', late: 1, alerted: 1 });
        const rows = await outboxRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].to).toBe('office@itbridgeschool.com');
        expect(rows[0].subject).toBe('Prezență nemarcată la 15 minute: Scratch Începători, 16:00');
        expect(rows[0].bodyText).toContain('- Scratch Începători, 16:00-17:30, Sala 1 (Drumul Taberei)');
        expect(rows[0].dedupeKey).toBe(`${DEDUPE_PREFIX}${sessionId}:2026-03-10T16:00`);
        expect(rows[0].status).toBe('pending');
    });

    it('says nothing about a class whose register was taken', async () => {
        await markAttendance(await createClassSession(dataSource, scratchId, { date: DAY }));

        expect((await job.checkAt(AT_16_20)).late).toBe(0);
        expect(await outboxRows()).toHaveLength(0);
    });

    it('says nothing about a cancelled class', async () => {
        await createClassSession(dataSource, scratchId, { date: DAY, status: 'cancelled' });

        expect((await job.checkAt(AT_16_20)).late).toBe(0);
        expect(await outboxRows()).toHaveLength(0);
    });

    /** Two classes on the day, one in the window and one two hours away: only the first is late. */
    it('leaves a class that has not started yet for a later tick', async () => {
        await createClassSession(dataSource, scratchId, { date: DAY });
        await createClassSession(dataSource, pythonId, { date: DAY });

        expect(await job.checkAt(AT_16_20)).toMatchObject({ late: 1, alerted: 1 });
        expect(await job.checkAt(AT_18_20)).toMatchObject({ late: 1, alerted: 1 });

        const rows = await outboxRows();
        expect(rows).toHaveLength(2);
        expect(rows[1].subject).toBe('Prezență nemarcată la 15 minute: Python Avansați, 18:00');
    });

    /** The restart case and the second-worker case: the unique index refuses, not a check that could race. */
    it('does not alert the same class twice', async () => {
        await createClassSession(dataSource, scratchId, { date: DAY });

        const first = await job.checkAt(AT_16_20);
        const second = await job.checkAt(new Date('2026-03-10T14:25:00Z'));

        expect(first.alerted).toBe(1);
        expect(second).toEqual({ checkedAt: '2026-03-10T16:25', late: 1, alerted: 0 });
        expect(await outboxRows()).toHaveLength(1);
    });

    /**
     * `moveSession` keeps the row. A class alerted on and then moved to Saturday is a new occasion
     * on Saturday, so the key carries the start and the second alert is written.
     */
    it('alerts again for the same class once it has been moved to another day', async () => {
        const sessionId = await createClassSession(dataSource, scratchId, { date: DAY });
        await job.checkAt(AT_16_20);

        await dataSource.query('UPDATE class_sessions SET date = $1 WHERE id = $2', ['2026-03-14', sessionId]);
        const result = await job.checkAt(new Date('2026-03-14T14:20:00Z'));

        expect(result).toMatchObject({ late: 1, alerted: 1 });
        expect((await outboxRows()).map((row) => row.dedupeKey)).toEqual([
            `${DEDUPE_PREFIX}${sessionId}:2026-03-10T16:00`,
            `${DEDUPE_PREFIX}${sessionId}:2026-03-14T16:00`,
        ]);
    });
});
