import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * The tap-to-mark endpoints, against a real database — E12/S6.
 *
 * The unit spec holds the branching; this holds what only Postgres shows: that the upsert really
 * writes one row per (child, class) however many times it is called, and that the register's one
 * payload carries the marks and the parent's phone the way the screen will read them.
 */
describe('Tap-to-mark attendance (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let parent: TestUser;
    let childId: number;
    let groupId: number;
    let sessionId: number;

    /** A day counted from today, in local components — the enrolments below are dated from today. */
    const daysFromToday = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
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
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.tap'));
        parent = await registerUser(app, 'parinte.tap');

        const profileId = await ownProfileId(app, parent);
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', birthDate: '2016-01-01', parentId: profileId })
            .expect(201);
        childId = child.body.id as number;

        const roomId = await createRoom(app, admin, { slug: 'tap-loc', name: 'Tap' });
        const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
        groupId = group.body.id as number;
        await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);

        // Today: the child joins the group today, and the register lists the group as it was on the
        // class's day — a class before today had no Ana in it.
        sessionId = await createClassSession(dataSource, groupId, { date: daysFromToday(0) });
    });

    const put = (present: boolean, session = sessionId, child = childId) =>
        request(app.getHttpServer()).put(`/attendance/session/${session}/child/${child}`).set('Authorization', admin.auth).send({ present });

    const rows = () => dataSource.query<{ present: boolean }[]>('SELECT "present" FROM "attendances"');

    describe('the upsert', () => {
        it('one row per child per class, however many taps arrive', async () => {
            await put(true).expect(200);
            await put(true).expect(200);
            await put(false).expect(200);

            const all = await rows();
            expect(all).toHaveLength(1);
            // The last tap wins — a changed mind is a second write, never a 409.
            expect(all[0].present).toBe(false);
        });

        it('refuses a cancelled class — nobody was present at a class that did not happen', async () => {
            const cancelled = await createClassSession(dataSource, groupId, { date: '2026-03-16', status: 'cancelled' });
            await put(true, cancelled).expect(400);
        });

        it('is closed to parents', async () => {
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${childId}`)
                .set('Authorization', parent.auth)
                .send({ present: true })
                .expect(403);
        });
    });

    describe('the register', () => {
        it('carries the child, the mark and the parent phone in one payload', async () => {
            await put(false).expect(200);

            const res = await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', admin.auth).expect(200);

            expect(res.body.session).toMatchObject({ groupId, groupName: 'Scratch Începători' });
            expect(res.body.entries).toHaveLength(1);
            // The phone the tel: button dials. Registration normalizes to +40…, so the register
            // answers the normalized form.
            expect(res.body.entries[0]).toMatchObject({ childId, firstName: 'Ana', present: false });
            expect(typeof res.body.entries[0].parentPhone).toBe('string');
        });

        it('answers null, not a missing key, for an unmarked child', async () => {
            const res = await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', admin.auth).expect(200);
            expect(res.body.entries[0].present).toBeNull();
            expect(res.body.entries[0].attendanceId).toBeNull();
        });

        /**
         * The review of 26 September 2026. A child booked on `/proba` belongs to a shell profile with
         * no phone, by design — the number the family typed is on the lead — and the phone register
         * showed neither a call button nor the „Probă" marker the desktop register draws.
         */
        it('gives a /proba booking the number the family left, and marks the trial', async () => {
            const roomId = await createRoom(app, admin, { slug: 'proba-tap', name: 'Proba' });
            const trialGroup = await request(app.getHttpServer())
                .post('/groups')
                .set('Authorization', admin.auth)
                .send(groupBody(roomId, { name: 'Probă', minAge: 8, maxAge: 12 }))
                .expect(201);
            const next = new Date();
            next.setDate(next.getDate() + (next.getDay() === 0 ? 1 : 8 - next.getDay()));
            const nextMonday = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
            const trialSession = await createClassSession(dataSource, trialGroup.body.id as number, { date: nextMonday });

            await request(app.getHttpServer())
                .post('/trial/bookings')
                .send({
                    parentName: 'Ioana Popescu',
                    parentEmail: 'ioana.popescu@example.com',
                    parentPhone: '0722333444',
                    childFirstName: 'Matei',
                    childLastName: 'Popescu',
                    childBirthDate: '2016-04-04',
                    classSessionId: trialSession,
                })
                .expect(201);

            const res = await request(app.getHttpServer()).get(`/attendance/session/${trialSession}/register`).set('Authorization', admin.auth).expect(200);
            expect(res.body.entries).toEqual([expect.objectContaining({ firstName: 'Matei', parentPhone: '+40722333444', trial: true })]);
        });

        it('is closed to parents — it carries other families’ phones', async () => {
            await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', parent.auth).expect(403);
        });
    });

    /**
     * The review of 26 September 2026: every register listed — and demanded — the group as it is
     * today. Last week's register asked for a child who joined this morning, and a trial booked for
     * next Monday sat on today's register as a regular pupil that had to be marked before it saved.
     */
    describe("the group on the class's day", () => {
        const familyWithChild = async (username: string, firstName: string) => {
            const family = await registerUser(app, username);
            const profileId = await ownProfileId(app, family);
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', family.auth)
                .send({ firstName, lastName: 'Test', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);
            return { family, childId: child.body.id as number };
        };

        const enrol = (child: number, group: number, extra: Record<string, unknown> = {}) =>
            request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: child, groupId: group, ...extra })
                .expect(201);

        let otherGroupId: number;
        let veteranId: number;

        beforeEach(async () => {
            const roomId = await createRoom(app, admin, { slug: 'ziua-loc', name: 'Ziua' });
            const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
            otherGroupId = group.body.id as number;
            veteranId = (await familyWithChild('parinte.vechi', 'Vechi')).childId;
            await enrol(veteranId, otherGroupId, { startDate: daysFromToday(-30) });
        });

        const registerOf = async (session: number) =>
            (await request(app.getHttpServer()).get(`/attendance/session/${session}/register`).set('Authorization', admin.auth).expect(200)).body as {
                entries: { childId: number; firstName: string; type: string; trial: boolean }[];
            };

        const bulk = (session: number, childIds: number[]) =>
            request(app.getHttpServer())
                .post(`/attendance/session/${session}`)
                .set('Authorization', admin.auth)
                .send({ childrenAttendance: childIds.map((id) => ({ childId: id, present: true })) });

        it("last week's register neither lists nor demands a child who joined today", async () => {
            const lastWeek = await createClassSession(dataSource, otherGroupId, { date: daysFromToday(-7) });
            const newcomer = await familyWithChild('parinte.nou', 'Nou');
            await enrol(newcomer.childId, otherGroupId);

            expect((await registerOf(lastWeek)).entries.map((entry) => entry.firstName)).toEqual(['Vechi']);
            await bulk(lastWeek, [veteranId]).expect(201);

            const seen = await request(app.getHttpServer()).get(`/attendance/child/${newcomer.childId}`).set('Authorization', newcomer.family.auth).expect(200);
            expect(seen.body).toHaveLength(0);
        });

        it("today's register leaves out a trial booked for a later class", async () => {
            const today = await createClassSession(dataSource, otherGroupId, { date: daysFromToday(0) });
            const trial = await familyWithChild('parinte.proba', 'Proba');
            await enrol(trial.childId, otherGroupId, { status: 'TRIAL', startDate: daysFromToday(7) });

            expect((await registerOf(today)).entries.map((entry) => entry.firstName)).toEqual(['Vechi']);
            await bulk(today, [veteranId]).expect(201);
        });

        it('a past register still lists and demands a child who has left since', async () => {
            const lastWeek = await createClassSession(dataSource, otherGroupId, { date: daysFromToday(-7) });
            const leaver = await familyWithChild('parinte.pleaca', 'Pleaca');
            await enrol(leaver.childId, otherGroupId, { startDate: daysFromToday(-30) });
            const [{ id: enrolmentId }] = await dataSource.query<{ id: number }[]>('SELECT id FROM enrollments WHERE child_id = $1', [leaver.childId]);
            await request(app.getHttpServer())
                .put(`/enrollments/${enrolmentId}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN', exitReason: 'Plecăm din oraș' })
                .expect(200);

            expect((await registerOf(lastWeek)).entries.map((entry) => entry.firstName)).toEqual(['Pleaca', 'Vechi']);
            await bulk(lastWeek, [veteranId]).expect(400);
            await bulk(lastWeek, [veteranId, leaver.childId]).expect(201);
            const [{ type }] = await dataSource.query<{ type: string }[]>('SELECT type FROM attendances WHERE "childId" = $1', [leaver.childId]);
            // In the group that day: a regular mark, which is what billing counts.
            expect(type).toBe('regular');
        });

        /**
         * The last day (CLAUDE.md, billing): `membersOn` reads the end day as departed, so a child
         * withdrawn this morning is not on this evening's register — and one marked before the
         * withdrawal stays on it, through the mark, with the mark's type.
         */
        it('the last day: withdrawn before the class, off the register; marked before the withdrawal, still on it', async () => {
            const today = await createClassSession(dataSource, otherGroupId, { date: daysFromToday(0) });
            const early = await familyWithChild('parinte.dimineata', 'Dimineata');
            const late = await familyWithChild('parinte.seara', 'Seara');
            await enrol(early.childId, otherGroupId, { startDate: daysFromToday(-30) });
            await enrol(late.childId, otherGroupId, { startDate: daysFromToday(-30) });
            // Marked during the class, then taken out of the group the same day.
            await request(app.getHttpServer())
                .put(`/attendance/session/${today}/child/${late.childId}`)
                .set('Authorization', admin.auth)
                .send({ present: true })
                .expect(200);
            for (const child of [early.childId, late.childId]) {
                const [{ id }] = await dataSource.query<{ id: number }[]>('SELECT id FROM enrollments WHERE child_id = $1', [child]);
                await request(app.getHttpServer())
                    .put(`/enrollments/${id}/close`)
                    .set('Authorization', admin.auth)
                    .send({ status: 'WITHDRAWN', exitReason: 'Plecăm' })
                    .expect(200);
            }

            const entries = (await registerOf(today)).entries;
            expect(entries.map((entry) => entry.firstName)).toEqual(['Vechi', 'Seara']);
            expect(entries.find((entry) => entry.firstName === 'Seara')?.type).toBe('regular');
        });
    });
});
