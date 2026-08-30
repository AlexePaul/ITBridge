import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { UnmarkedAttendanceJob } from 'src/modules/class-session/unmarked-attendance.job';
import { createClassSession, createRoom, createTestApp, groupBody, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The daily reminder about registers nobody took, against a real database.
 *
 * The unit spec checks what the job does with an answer; this checks that the answer is right,
 * which is the part a mock cannot prove. "No class that day", "every class marked" and "a class
 * cancelled" all reduce to an empty list, and the only thing that distinguishes them is the SQL —
 * so they are only really tested here, where Postgres does the distinguishing.
 *
 * The job is driven through `reportFor`, never through its cron: the schedule is disabled under
 * `NODE_ENV=test` precisely so a suite that happens to run at ten in the morning does not queue a
 * message in the middle of somebody else's assertions.
 */
describe('Daily unmarked-attendance reminder (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let job: UnmarkedAttendanceJob;

    let admin: TestUser;
    let parent: TestUser;
    let childId: number;
    let scratchId: number;
    let pythonId: number;

    /** A day nothing is scheduled on, kept away from the day under test. */
    const QUIET_DAY = '2026-03-09';
    const REPORT_DAY = '2026-03-10';

    async function outboxRows(): Promise<OutboxMessage[]> {
        return dataSource.getRepository(OutboxMessage).find({ order: { id: 'ASC' } });
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
        job = app.get(UnmarkedAttendanceJob);
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);

        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        parent = await registerUser(app, 'ana');

        const profile = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
            .expect(201);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: profile.body.id as number, firstName: 'Maria', lastName: 'Pop', birthDate: '2015-05-05' })
            .expect(201);
        childId = child.body.id as number;

        // Two groups in one room, at different hours — the room is what cannot be in two places at
        // once, so this is the arrangement the schedule constraint actually allows.
        const roomId = await createRoom(app, admin);
        const scratch = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        const python = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(roomId, { name: 'Python Avansați', startTime: '18:00', endTime: '19:30' }))
            .expect(201);
        scratchId = scratch.body.id as number;
        pythonId = python.body.id as number;

        // Enrolment is E11; until then the group is set directly.
        await dataSource.query('UPDATE children SET group_id = $1 WHERE id = $2', [scratchId, childId]);
    });

    it('says nothing about a day with no classes on it', async () => {
        await createClassSession(dataSource, scratchId, { date: REPORT_DAY });

        const result = await job.reportFor(QUIET_DAY);

        expect(result).toEqual({ date: QUIET_DAY, unmarked: 0, queued: false });
        expect(await outboxRows()).toHaveLength(0);
    });

    it('says nothing about a day whose classes were all marked', async () => {
        const session = await createClassSession(dataSource, scratchId, { date: REPORT_DAY });
        await markAttendance(session);

        const result = await job.reportFor(REPORT_DAY);

        expect(result.unmarked).toBe(0);
        expect(await outboxRows()).toHaveLength(0);
    });

    it('queues one message listing two unmarked classes, with group, hour and room', async () => {
        await createClassSession(dataSource, scratchId, { date: REPORT_DAY });
        await createClassSession(dataSource, pythonId, { date: REPORT_DAY });

        const result = await job.reportFor(REPORT_DAY);

        expect(result).toEqual({ date: REPORT_DAY, unmarked: 2, queued: true });

        const rows = await outboxRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].to).toBe('office@itbridgeschool.com');
        expect(rows[0].subject).toBe('Prezență nemarcată: 2 ședințe, marți 10.03.2026');
        expect(rows[0].bodyText).toContain('- Scratch Începători, 16:00-17:30, Sala 1 (Drumul Taberei)');
        expect(rows[0].bodyText).toContain('- Python Avansați, 18:00-19:30, Sala 1 (Drumul Taberei)');
        expect(rows[0].status).toBe('pending');
    });

    /**
     * A class that was called off has no register to take. Reporting it would be naming a task
     * nobody has to do, every day until somebody stopped reading the message.
     */
    it('ignores a cancelled class entirely', async () => {
        await createClassSession(dataSource, scratchId, { date: REPORT_DAY, status: 'cancelled' });
        await createClassSession(dataSource, pythonId, { date: REPORT_DAY });

        const result = await job.reportFor(REPORT_DAY);

        expect(result.unmarked).toBe(1);
        const rows = await outboxRows();
        expect(rows[0].subject).toContain('o ședință');
        expect(rows[0].bodyText).not.toContain('Scratch Începători');
    });

    it('stays silent when the only class that day was cancelled', async () => {
        await createClassSession(dataSource, scratchId, { date: REPORT_DAY, status: 'cancelled' });

        expect((await job.reportFor(REPORT_DAY)).queued).toBe(false);
        expect(await outboxRows()).toHaveLength(0);
    });

    /**
     * The restart-at-10:05 case, and the second-PM2-worker case. `dedupeKey` is a unique column, so
     * the second insert is refused by the database rather than by a check that could race.
     */
    it('does not queue the same day twice', async () => {
        await createClassSession(dataSource, scratchId, { date: REPORT_DAY });

        const first = await job.reportFor(REPORT_DAY);
        const second = await job.reportFor(REPORT_DAY);

        expect(first.queued).toBe(true);
        expect(second).toEqual({ date: REPORT_DAY, unmarked: 1, queued: false });
        expect(await outboxRows()).toHaveLength(1);
    });

    /** A different day is a different message, which is what `dedupeKey` must not prevent. */
    it('queues a separate message for a different day', async () => {
        await createClassSession(dataSource, scratchId, { date: REPORT_DAY });
        await createClassSession(dataSource, scratchId, { date: QUIET_DAY });

        await job.reportFor(REPORT_DAY);
        await job.reportFor(QUIET_DAY);

        const rows = await outboxRows();
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.dedupeKey)).toEqual(['unmarked-attendance:2026-03-10', 'unmarked-attendance:2026-03-09']);
    });
});
