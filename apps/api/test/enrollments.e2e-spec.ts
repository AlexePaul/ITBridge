import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Enrolment as a period, and the capacity rule — E11/S1 and S3, over HTTP and against Postgres.
 *
 * The unit tests already assert the shape of each decision. What only this suite can show is that
 * the two invariants hold in the database: the partial unique index that makes a second enrolment
 * impossible, and `Child.group` staying true to the enrolment table through every operation.
 */
describe('Enrolments and capacity (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let roomId: number;

    const childNumber = { n: 0 };

    /** A child of `parent`, with a name nobody else has. */
    const makeChild = async (): Promise<number> => {
        childNumber.n += 1;
        const res = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', parent.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName: `Copil${childNumber.n}`, lastName: 'Test', birthDate: '2016-05-04' })
            .expect(201);
        return res.body.id as number;
    };

    const makeGroup = async (overrides: Record<string, unknown> = {}): Promise<number> => {
        const res = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId, overrides)).expect(201);
        return res.body.id as number;
    };

    /** Until `count` statements are queued on a lock — how a test knows an interleaving is set up. */
    const waitingOnLocks = async (count: number): Promise<void> => {
        for (let attempt = 0; attempt < 200; attempt++) {
            const [{ waiting }] = await dataSource.query<{ waiting: string }[]>('SELECT COUNT(*) AS waiting FROM pg_locks WHERE NOT granted');
            if (Number(waiting) >= count) return;
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`Expected ${count} statement(s) waiting on a lock`);
    };

    /** What `Child.group` says right now, straight from the database. */
    const derivedGroupOf = async (childId: number): Promise<number | null> => {
        const rows = await dataSource.query('SELECT group_id FROM children WHERE id = $1', [childId]);
        return rows[0].group_id as number | null;
    };

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        childNumber.n = 0;
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        parent = await registerUser(app, 'ana');
        roomId = await createRoom(app, admin);
    });

    afterAll(async () => {
        await app.close();
    });

    describe('the history S1 exists for', () => {
        it('answers "which group was this child in on a given day"', async () => {
            const childId = await makeChild();
            const first = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30' });
            const second = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });

            const opened = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId, groupId: first, startDate: '2026-01-10' })
                .expect(201);

            await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'TRANSFERRED', endDate: '2026-03-31', exitReason: 'Transfer' })
                .expect(200);

            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId, groupId: second, startDate: '2026-04-01' })
                .expect(201);

            // The whole question the old single foreign key could not answer.
            const inMarch = await request(app.getHttpServer())
                .get(`/enrollments/group/${first}/members?date=2026-03-15`)
                .set('Authorization', admin.auth)
                .expect(200);
            expect(inMarch.body).toHaveLength(1);

            const inMay = await request(app.getHttpServer())
                .get(`/enrollments/group/${first}/members?date=2026-05-15`)
                .set('Authorization', admin.auth)
                .expect(200);
            expect(inMay.body).toHaveLength(0);

            const history = await request(app.getHttpServer()).get(`/enrollments/child/${childId}`).set('Authorization', admin.auth).expect(200);
            expect(history.body).toHaveLength(2);
            expect(history.body.map((row: { status: string }) => row.status)).toEqual(['ACTIVE', 'TRANSFERRED']);
        });

        it('keeps the closed row when a child leaves, rather than forgetting where they were', async () => {
            const childId = await makeChild();
            const groupId = await makeGroup();
            const opened = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN', exitReason: 'S-a mutat din oraș' })
                .expect(200);

            const history = await request(app.getHttpServer()).get(`/enrollments/child/${childId}`).set('Authorization', admin.auth).expect(200);
            expect(history.body[0]).toMatchObject({ status: 'WITHDRAWN', exitReason: 'S-a mutat din oraș', endDate: expect.any(String) });
        });
    });

    describe('one group at a time (D6)', () => {
        it('refuses a second enrolment while one is in force', async () => {
            const childId = await makeChild();
            const first = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30' });
            const second = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });

            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: first }).expect(201);

            const res = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: second }).expect(409);
            expect(res.body.code).toBe('CHILD_ALREADY_ENROLLED');
        });

        it('counts a booked trial as in force, so it blocks a second one too', async () => {
            const childId = await makeChild();
            const first = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30' });
            const second = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });

            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId, groupId: first, status: 'TRIAL' })
                .expect(201);

            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: second }).expect(409);
        });

        it('is a database rule, not only a service one', async () => {
            const childId = await makeChild();
            const first = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30' });
            const second = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: first }).expect(201);

            // Going around the service entirely, the way two admins clicking in the same second
            // would. `UQ_enrollments_one_in_force` is what makes the rule true rather than usual.
            await expect(
                dataSource.query(`INSERT INTO enrollments (child_id, group_id, status, "startDate") VALUES ($1, $2, 'ACTIVE', CURRENT_DATE)`, [
                    childId,
                    second,
                ]),
            ).rejects.toThrow();
        });

        it('lets a child enrol again once the previous enrolment is closed', async () => {
            const childId = await makeChild();
            const groupId = await makeGroup();
            const opened = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'COMPLETED' })
                .expect(200);

            // History accumulates; only the rows in force are unique. That is why the index is partial.
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);
        });
    });

    describe('capacity (D7)', () => {
        it('refuses the eleventh child in a room of ten', async () => {
            const groupId = await makeGroup({ capacity: 2 });
            for (let i = 0; i < 2; i++) {
                await request(app.getHttpServer())
                    .post('/enrollments')
                    .set('Authorization', admin.auth)
                    .send({ childId: await makeChild(), groupId })
                    .expect(201);
            }

            const res = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(409);
            expect(res.body.code).toBe('GROUP_FULL');
        });

        it('counts a trial as a seat, so a group of two with one trial refuses a second child', async () => {
            const groupId = await makeGroup({ capacity: 2 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, status: 'TRIAL' })
                .expect(201);

            // A trial child sits on a chair, at a computer, in the same room. The refusal is the
            // same one as for a full group, because it is not a separate limit.
            const res = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, status: 'TRIAL' })
                .expect(409);
            expect(res.body.code).toBe('GROUP_FULL');
        });

        it('reports occupancy including trials', async () => {
            const groupId = await makeGroup({ capacity: 10 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, status: 'TRIAL' })
                .expect(201);

            const res = await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', admin.auth).expect(200);
            expect(res.body).toMatchObject({ capacity: 10, taken: 2, free: 8 });
        });

        it('lets an admin past the limit only when they ask explicitly', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);

            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(409);

            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, allowOverCapacity: true })
                .expect(201);
        });

        it('leaves the override in the audit log, answerable by group', async () => {
            // S3's acceptance, end to end: "who put a second child in a room with one chair, and
            // when". Asked of the group, because the exception is about the room.
            const groupId = await makeGroup({ capacity: 1 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, allowOverCapacity: true })
                .expect(201);

            const trail = await request(app.getHttpServer()).get(`/audit?entityType=Group&entityId=${groupId}`).set('Authorization', admin.auth).expect(200);

            expect(trail.body).toHaveLength(1);
            expect(trail.body[0]).toMatchObject({
                entityType: 'Group',
                entityId: groupId,
                changes: { seatsTaken: { from: 1, to: 2 } },
                note: 'Înscriere peste capacitate: 2 copii într-un loc.',
            });
            // The name is copied in at write time, so the trail stays readable after the account is
            // gone — the whole reason the actor is denormalised.
            expect(trail.body[0].actorUsername).toBe(admin.username);
        });

        it('writes nothing to the trail for an enrolment that fits', async () => {
            const groupId = await makeGroup({ capacity: 2 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);

            const trail = await request(app.getHttpServer()).get(`/audit?entityType=Group&entityId=${groupId}`).set('Authorization', admin.auth).expect(200);

            expect(trail.body).toHaveLength(0);
        });

        /**
         * The review of 25 September 2026: the group's seats are not the whole question. A class
         * holding a child the office moved in for the week has a chair fewer, and a child enrolled
         * now sits in that class too — the tenth child of ten went in while Thursday's class held a
         * visitor, and the room had eleven that Thursday.
         */
        it('refuses the last seat of the group while one of its coming classes holds a visitor', async () => {
            const groupId = await makeGroup({ capacity: 2 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
            const classId = await createClassSession(dataSource, groupId, { date: '2027-04-05' });

            // A child from another group, moved into that class for the week.
            const otherGroup = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });
            const visitor = await makeChild();
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: visitor, groupId: otherGroup })
                .expect(201);
            const missed = await createClassSession(dataSource, otherGroup, { date: '2027-04-05' });
            await dataSource.query(
                `INSERT INTO absence_notices (child_id, class_session_id, reason, "inTime", replacement_session_id) VALUES ($1, $2, 'Răcit', true, $3)`,
                [visitor, missed, classId],
            );

            const refused = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(409);
            expect(refused.body.code).toBe('GROUP_FULL');
            expect(refused.body.message).toContain('2027-04-05');

            // The office can still decide otherwise, and the trail names the class it overfilled.
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, allowOverCapacity: true })
                .expect(201);
            const trail = await request(app.getHttpServer()).get(`/audit?entityType=Group&entityId=${groupId}`).set('Authorization', admin.auth).expect(200);
            expect(trail.body[0].note).toBe('Înscriere peste locurile orei din 2027-04-05: 3 copii în 2 locuri.');
        });

        /** The child moved into a class of the group for the week, and now joining it, takes one chair there, not two. */
        it('does not count the child being moved in as a visitor to the classes they join', async () => {
            const own = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });
            const target = await makeGroup({ capacity: 2 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId: target })
                .expect(201);
            const mover = await makeChild();
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId: mover, groupId: own }).expect(201);

            // This week the office already sent them to the target group's class.
            const missed = await createClassSession(dataSource, own, { date: '2027-04-05' });
            const visited = await createClassSession(dataSource, target, { date: '2027-04-05' });
            await dataSource.query(
                `INSERT INTO absence_notices (child_id, class_session_id, reason, "inTime", replacement_session_id) VALUES ($1, $2, 'Răcit', true, $3)`,
                [mover, missed, visited],
            );

            await request(app.getHttpServer())
                .post('/enrollments/transfer')
                .set('Authorization', admin.auth)
                .send({ childId: mover, toGroupId: target })
                .expect(201);
        });

        /** The review of 25 September 2026: a close dated ahead freed the seat at once, with the child still in it. */
        it('refuses to close on a day ahead, and leaves the child in the group', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const childId = await makeChild();
            const opened = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            const res = await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN', endDate: '2999-01-01' })
                .expect(400);

            expect(res.body.code).toBe('ENROLLMENT_END_IN_FUTURE');
            expect(await derivedGroupOf(childId)).toBe(groupId);
        });

        it('frees the seat when an enrolment closes', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const childId = await makeChild();
            const opened = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN' })
                .expect(200);

            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
        });
    });

    describe('the waiting list', () => {
        it('offers a freed seat to the first family in the queue, and mails them', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const enrolled = await makeChild();
            const waitingFirst = await makeChild();
            const waitingSecond = await makeChild();

            const opened = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: enrolled, groupId })
                .expect(201);

            await request(app.getHttpServer())
                .post('/enrollments/waitlist')
                .set('Authorization', admin.auth)
                .send({ childId: waitingFirst, groupId, note: 'Sună după 17' })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments/waitlist')
                .set('Authorization', admin.auth)
                .send({ childId: waitingSecond, groupId })
                .expect(201);

            await dataSource.query('DELETE FROM outbox');

            await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN' })
                .expect(200);

            const queue = await request(app.getHttpServer()).get(`/enrollments/waitlist/group/${groupId}`).set('Authorization', admin.auth).expect(200);
            // The first in the queue, by when they asked, and only the first: one seat freed is one
            // offer made.
            expect(queue.body.map((entry: { status: string }) => entry.status)).toEqual(['OFFERED', 'WAITING']);
            expect(queue.body[0].respondBy).toEqual(expect.any(String));

            const messages = await dataSource.query('SELECT * FROM outbox');
            expect(messages).toHaveLength(1);
            expect(messages[0].bodyText).toContain('lista de așteptare');
        });

        it('hands the seat to the next family when the first declines', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const enrolled = await makeChild();
            const first = await makeChild();
            const second = await makeChild();
            const opened = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: enrolled, groupId })
                .expect(201);
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId: first, groupId }).expect(201);
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId: second, groupId }).expect(201);
            await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN' })
                .expect(200);

            const queue = await request(app.getHttpServer()).get(`/enrollments/waitlist/group/${groupId}`).set('Authorization', admin.auth).expect(200);
            await request(app.getHttpServer())
                .delete(`/enrollments/waitlist/${queue.body[0].id}`)
                .set('Authorization', admin.auth)
                .send({ status: 'DECLINED' })
                .expect(200);

            const after = await request(app.getHttpServer()).get(`/enrollments/waitlist/group/${groupId}`).set('Authorization', admin.auth).expect(200);
            expect(after.body).toHaveLength(1);
            expect(after.body[0].status).toBe('OFFERED');
        });

        it('refuses a second open request for the same child and group', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const childId = await makeChild();
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            const res = await request(app.getHttpServer())
                .post('/enrollments/waitlist')
                .set('Authorization', admin.auth)
                .send({ childId, groupId })
                .expect(409);
            expect(res.body.code).toBe('ALREADY_ON_WAITLIST');
        });

        it('settles the request when the family is enrolled', async () => {
            const groupId = await makeGroup({ capacity: 5 });
            const childId = await makeChild();
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            // Left open, the family would keep a place in a queue for a seat they are sitting in.
            const queue = await request(app.getHttpServer()).get(`/enrollments/waitlist/group/${groupId}`).set('Authorization', admin.auth).expect(200);
            expect(queue.body).toHaveLength(0);
        });
    });

    /**
     * The seats a waiting list is promised, and the doors that free one — the review of 25
     * September 2026. Each of these found a way for a family to be told a seat was theirs while it
     * was not, or never to be told about one that was.
     */
    describe('seats offered to the list', () => {
        /** A group of one, full, with `waiting` children queued behind it. Returns the enrolment. */
        const fullGroupWithQueue = async (waiting: number, overrides: Record<string, unknown> = {}) => {
            const groupId = await makeGroup({ capacity: 1, ...overrides });
            const opened = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
            const queued: number[] = [];
            for (let i = 0; i < waiting; i++) {
                const childId = await makeChild();
                await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);
                queued.push(childId);
            }
            return { groupId, enrollmentId: opened.body.id as number, queued };
        };
        const statuses = async (groupId: number): Promise<string[]> =>
            (await dataSource.query<{ status: string }[]>('SELECT status FROM waitlist_entries WHERE group_id = $1 ORDER BY id', [groupId])).map(
                (row) => row.status,
            );
        const close = (enrollmentId: number) =>
            request(app.getHttpServer()).put(`/enrollments/${enrollmentId}/close`).set('Authorization', admin.auth).send({ status: 'WITHDRAWN' });

        /**
         * For 48 hours the offered family has the seat. Every count left it out, so an admin (or the
         * public form) could take it, and the family who said yes met a full group.
         */
        it('holds the offered seat for the family it was offered to', async () => {
            const { groupId, enrollmentId, queued } = await fullGroupWithQueue(1);
            await close(enrollmentId).expect(200);

            const other = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(409);
            expect(other.body.code).toBe('GROUP_FULL');
            expect(other.body.message).toContain('un loc oferit listei de așteptare');

            const occupancy = await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', admin.auth).expect(200);
            expect(occupancy.body).toMatchObject({ taken: 0, held: 1, free: 0 });

            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId: queued[0], groupId }).expect(201);
        });

        /**
         * Two presses of "close" used to both read the enrolment open, both write it and both
         * release the seat: two families offered one chair. Forced, not hoped for: a second
         * connection holds the group, both requests queue behind it, and it is let go.
         */
        it('releases a seat once, however many times it is closed at the same moment', async () => {
            const { groupId, enrollmentId } = await fullGroupWithQueue(2);
            const holder = dataSource.createQueryRunner();
            await holder.connect();
            await holder.startTransaction();
            let answers: number[] = [];
            try {
                await holder.query('SELECT 1 FROM groups WHERE id = $1 FOR UPDATE', [groupId]);
                const first = close(enrollmentId).then((res) => res.status);
                const second = close(enrollmentId).then((res) => res.status);
                await waitingOnLocks(2);
                await holder.commitTransaction();
                answers = await Promise.all([first, second]);
            } finally {
                if (holder.isTransactionActive) await holder.rollbackTransaction();
                await holder.release();
            }

            expect([...answers].sort()).toEqual([200, 409]);
            expect(await statuses(groupId)).toEqual(['OFFERED', 'WAITING']);
        });

        it('offers every seat a capacity raise frees, one family each', async () => {
            const { groupId } = await fullGroupWithQueue(3);

            await request(app.getHttpServer()).put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ capacity: 3 }).expect(200);

            expect(await statuses(groupId)).toEqual(['OFFERED', 'OFFERED', 'WAITING']);
        });

        /** Accepting would meet `GROUP_INACTIVE` — an offer that is a door closed in the family's face. */
        it('offers nothing in a group that takes no enrolments', async () => {
            const { groupId, enrollmentId } = await fullGroupWithQueue(1);
            await request(app.getHttpServer()).put(`/groups/${groupId}`).set('Authorization', admin.auth).send({ isActive: false }).expect(200);

            await close(enrollmentId).expect(200);

            expect(await statuses(groupId)).toEqual(['WAITING']);
        });

        /** A cascade frees the seat without asking anybody; the delete asks for it. */
        it('hands the seat of a deleted child to the list', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const childId = await makeChild();
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);
            await request(app.getHttpServer())
                .post('/enrollments/waitlist')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);

            await request(app.getHttpServer()).delete(`/children/${childId}`).set('Authorization', parent.auth).expect(200);

            expect(await statuses(groupId)).toEqual(['OFFERED']);
        });

        /**
         * A family the office typed in from a phone call may have no address. The offer stands and
         * the clock runs; what changed is that the queue now says so (E17/S5), where a warning in a
         * log looked exactly like a family that had been told.
         */
        it('records an offer that had nowhere to go, rather than logging it', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const opened = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
            const family = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Fără', lastName: 'Adresă' })
                .expect(201);
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ parentId: family.body.id as number, firstName: 'Tudor', lastName: 'Adresă', birthDate: '2016-05-04' })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments/waitlist')
                .set('Authorization', admin.auth)
                .send({ childId: child.body.id as number, groupId })
                .expect(201);
            await dataSource.query('DELETE FROM outbox');

            await close(opened.body.id as number).expect(200);

            expect(await statuses(groupId)).toEqual(['OFFERED']);
            const rows = await dataSource.query<{ status: string; undeliverableReason: string }[]>('SELECT status, "undeliverableReason" FROM outbox');
            expect(rows).toEqual([{ status: 'undeliverable', undeliverableReason: 'no_address' }]);
        });

        /** An offer made by hand has no `respondBy`, so the sweep could never expire it. */
        it('does not let an entry be set to "offered" by hand', async () => {
            const { groupId } = await fullGroupWithQueue(1);
            const [{ id }] = await dataSource.query<{ id: number }[]>('SELECT id FROM waitlist_entries WHERE group_id = $1', [groupId]);

            await request(app.getHttpServer()).delete(`/enrollments/waitlist/${id}`).set('Authorization', admin.auth).send({ status: 'OFFERED' }).expect(400);

            expect(await statuses(groupId)).toEqual(['WAITING']);
        });
    });

    describe('Child.group stays derived', () => {
        it('is set by enrolling and cleared by closing', async () => {
            const childId = await makeChild();
            const groupId = await makeGroup();

            const opened = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);
            expect(await derivedGroupOf(childId)).toBe(groupId);

            await request(app.getHttpServer())
                .put(`/enrollments/${opened.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN' })
                .expect(200);
            expect(await derivedGroupOf(childId)).toBeNull();
        });

        it('follows the old routes too, because they open and close enrolments now', async () => {
            const childId = await makeChild();
            const groupId = await makeGroup();

            // `POST /children/:childId/groups/:groupId` is what the admin screens already call.
            await request(app.getHttpServer()).post(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(201);
            expect(await derivedGroupOf(childId)).toBe(groupId);

            const history = await request(app.getHttpServer()).get(`/enrollments/child/${childId}`).set('Authorization', admin.auth).expect(200);
            expect(history.body).toHaveLength(1);

            // 204, which is what this route has always answered.
            await request(app.getHttpServer()).delete(`/children/${childId}/groups/${groupId}`).set('Authorization', admin.auth).expect(204);
            expect(await derivedGroupOf(childId)).toBeNull();

            // Removing a child closes the enrolment rather than deleting it — the history is the
            // point, and a seat freed by a vanished row is a seat nobody knows about.
            const after = await request(app.getHttpServer()).get(`/enrollments/child/${childId}`).set('Authorization', admin.auth).expect(200);
            expect(after.body).toHaveLength(1);
            expect(after.body[0].status).toBe('WITHDRAWN');
        });

        it('applies the capacity rule to the old route as well', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            await request(app.getHttpServer())
                .post(`/children/${await makeChild()}/groups/${groupId}`)
                .set('Authorization', admin.auth)
                .expect(201);

            const res = await request(app.getHttpServer())
                .post(`/children/${await makeChild()}/groups/${groupId}`)
                .set('Authorization', admin.auth)
                .expect(409);
            expect(res.body.code).toBe('GROUP_FULL');
        });
    });

    describe('transfers (S5)', () => {
        it('closes one period and opens another, keeping both in the history', async () => {
            const childId = await makeChild();
            const from = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30' });
            const to = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: from }).expect(201);

            await request(app.getHttpServer())
                .post('/enrollments/transfer')
                .set('Authorization', admin.auth)
                .send({ childId, toGroupId: to, reason: 'Familia a cerut marțea' })
                .expect(201);

            const history = await request(app.getHttpServer()).get(`/enrollments/child/${childId}`).set('Authorization', admin.auth).expect(200);
            expect(history.body).toHaveLength(2);
            const closed = history.body.find((row: { status: string }) => row.status === 'TRANSFERRED');
            expect(closed).toMatchObject({ exitReason: 'Familia a cerut marțea', endDate: expect.any(String) });

            // `Child.group` follows, and D6 still holds: exactly one enrolment is in force.
            expect(await derivedGroupOf(childId)).toBe(to);
            const stillOpen = history.body.filter((row: { endDate: string | null }) => row.endDate === null);
            expect(stillOpen).toHaveLength(1);
        });

        it('frees the old seat and fills the new one, in one step', async () => {
            const childId = await makeChild();
            const from = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30', capacity: 1 });
            const to = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30', capacity: 1 });
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: from }).expect(201);

            await request(app.getHttpServer()).post('/enrollments/transfer').set('Authorization', admin.auth).send({ childId, toGroupId: to }).expect(201);

            const oldSeats = await request(app.getHttpServer()).get(`/enrollments/group/${from}/occupancy`).set('Authorization', admin.auth).expect(200);
            const newSeats = await request(app.getHttpServer()).get(`/enrollments/group/${to}/occupancy`).set('Authorization', admin.auth).expect(200);
            expect(oldSeats.body).toMatchObject({ taken: 0, free: 1 });
            expect(newSeats.body).toMatchObject({ taken: 1, free: 0 });
        });

        /**
         * This used to assert the opposite — "the seat is not free, it is being handed to this
         * child" — which is true of no seat: the child sits in the other group now, and this group's
         * own occupancy said `free: 1` beside a list nobody told.
         */
        it('hands the vacated seat to the old group’s waiting list', async () => {
            const childId = await makeChild();
            const from = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30', capacity: 1 });
            const to = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30' });
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: from }).expect(201);
            await request(app.getHttpServer())
                .post('/enrollments/waitlist')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId: from })
                .expect(201);

            await request(app.getHttpServer()).post('/enrollments/transfer').set('Authorization', admin.auth).send({ childId, toGroupId: to }).expect(201);

            const queue = await request(app.getHttpServer()).get(`/enrollments/waitlist/group/${from}`).set('Authorization', admin.auth).expect(200);
            expect(queue.body[0].status).toBe('OFFERED');
        });

        /**
         * A child offered a seat in another group moves there by transfer — `enrol` refuses a
         * second enrolment. The offer is the seat they take, and being in the group settles it; left
         * open, it expired two days later and mailed a family already sitting in the room that its
         * seat had gone to the next one.
         */
        it('takes the seat offered to the child, and settles the offer', async () => {
            const childId = await makeChild();
            const from = await makeGroup({ name: 'Scratch', startTime: '16:00', endTime: '17:30' });
            const to = await makeGroup({ name: 'Python', startTime: '18:00', endTime: '19:30', capacity: 1 });
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId: from }).expect(201);
            const sitting = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId: to })
                .expect(201);
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId, groupId: to }).expect(201);
            await request(app.getHttpServer())
                .put(`/enrollments/${sitting.body.id}/close`)
                .set('Authorization', admin.auth)
                .send({ status: 'WITHDRAWN' })
                .expect(200);

            await request(app.getHttpServer()).post('/enrollments/transfer').set('Authorization', admin.auth).send({ childId, toGroupId: to }).expect(201);

            const queue = await request(app.getHttpServer()).get(`/enrollments/waitlist/group/${to}`).set('Authorization', admin.auth).expect(200);
            expect(queue.body).toEqual([]);
            const [{ status }] = await dataSource.query<{ status: string }[]>('SELECT status FROM waitlist_entries WHERE child_id = $1', [childId]);
            expect(status).toBe('ACCEPTED');
        });

        it('refuses when the child has nothing to transfer from', async () => {
            const res = await request(app.getHttpServer())
                .post('/enrollments/transfer')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), toGroupId: await makeGroup() })
                .expect(409);
            expect(res.body.code).toBe('NOTHING_TO_TRANSFER');
        });
    });

    describe('trials (S4)', () => {
        it('takes a seat while it runs and gives it back when it closes', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const childId = await makeChild();
            const trial = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId, groupId, status: 'TRIAL' })
                .expect(201);

            let seats = await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', admin.auth).expect(200);
            expect(seats.body).toMatchObject({ taken: 1, free: 0 });

            await request(app.getHttpServer())
                .put(`/enrollments/${trial.body.id}/resolve-trial`)
                .set('Authorization', admin.auth)
                .send({ accepted: false, reason: 'Nu s-a potrivit programul' })
                .expect(200);

            seats = await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', admin.auth).expect(200);
            expect(seats.body).toMatchObject({ taken: 0, free: 1 });
            expect(await derivedGroupOf(childId)).toBeNull();
        });

        it('becomes a real enrolment on the same row, so the history reads as one period', async () => {
            const groupId = await makeGroup();
            const childId = await makeChild();
            const trial = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId, groupId, status: 'TRIAL', startDate: '2026-02-01' })
                .expect(201);

            await request(app.getHttpServer())
                .put(`/enrollments/${trial.body.id}/resolve-trial`)
                .set('Authorization', admin.auth)
                .send({ accepted: true })
                .expect(200);

            const history = await request(app.getHttpServer()).get(`/enrollments/child/${childId}`).set('Authorization', admin.auth).expect(200);
            expect(history.body).toHaveLength(1);
            expect(history.body[0]).toMatchObject({ status: 'ACTIVE', startDate: '2026-02-01', endDate: null });
        });

        it('appears in the group roster, marked as a trial', async () => {
            const groupId = await makeGroup();
            const childId = await makeChild();
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId, status: 'TRIAL' }).expect(201);

            const members = await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/members`).set('Authorization', admin.auth).expect(200);
            expect(members.body).toHaveLength(1);
            expect(members.body[0].status).toBe('TRIAL');
        });

        it('lists trials that nobody has decided on', async () => {
            const groupId = await makeGroup();
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, status: 'TRIAL' })
                .expect(201);

            // A trial nobody closes holds a seat for ever; this list is what keeps capacity honest.
            const res = await request(app.getHttpServer()).get('/enrollments/trials/unresolved').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(1);
        });

        it('refuses to resolve something that is not a trial', async () => {
            const groupId = await makeGroup();
            const enrolled = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);

            const res = await request(app.getHttpServer())
                .put(`/enrollments/${enrolled.body.id}/resolve-trial`)
                .set('Authorization', admin.auth)
                .send({ accepted: true })
                .expect(409);
            expect(res.body.code).toBe('NOT_A_TRIAL');
        });
    });

    describe('compatibility (S6)', () => {
        it('asks for confirmation when the age is outside the group band, then accepts', async () => {
            const groupId = await makeGroup({ minAge: 11, maxAge: 14 });
            const childId = await makeChild(); // born 2016, so seven or eight

            const refused = await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(409);
            expect(refused.body.code).toBe('COMPATIBILITY_WARNINGS');
            expect(refused.body.message).toContain('11-14');

            // A warning, not a block: the admin can be right about a child, unlike about a chair.
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId, groupId, acknowledgeWarnings: true })
                .expect(201);
        });

        it('says nothing when the age fits', async () => {
            const groupId = await makeGroup({ minAge: 6, maxAge: 16 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId })
                .expect(201);
        });

        it('does not let acknowledging warnings past a full group', async () => {
            const groupId = await makeGroup({ capacity: 1, minAge: 11, maxAge: 14 });
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, acknowledgeWarnings: true })
                .expect(201);

            const res = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, acknowledgeWarnings: true })
                .expect(409);
            expect(res.body.code).toBe('GROUP_FULL');
        });
    });

    describe('unmet demand (S7)', () => {
        it('buckets unplaced children by age band', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            await makeChild();
            await makeChild();

            const res = await request(app.getHttpServer()).get('/enrollments/demand').set('Authorization', admin.auth).expect(200);

            expect(res.body.length).toBeGreaterThan(0);
            const total = res.body.reduce((sum: number, bucket: { children: unknown[] }) => sum + bucket.children.length, 0);
            expect(total).toBe(2);
            expect(res.body[0].ageBand).toEqual(expect.any(String));
            expect(groupId).toEqual(expect.any(Number));
        });

        it('drops a child from the demand the moment they are enrolled', async () => {
            const groupId = await makeGroup();
            const childId = await makeChild();

            await request(app.getHttpServer()).post('/enrollments').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            const res = await request(app.getHttpServer()).get('/enrollments/demand').set('Authorization', admin.auth).expect(200);
            const total = res.body.reduce((sum: number, bucket: { children: unknown[] }) => sum + bucket.children.length, 0);
            expect(total).toBe(0);
        });

        it('counts a child on a waiting list against the location they asked for, once', async () => {
            const groupId = await makeGroup({ capacity: 1 });
            const childId = await makeChild();
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', admin.auth).send({ childId, groupId }).expect(201);

            const res = await request(app.getHttpServer()).get('/enrollments/demand').set('Authorization', admin.auth).expect(200);

            expect(res.body.some((bucket: { locationName: string }) => bucket.locationName === 'Drumul Taberei')).toBe(true);
            // A child on a waiting list has no group either, so they satisfy both queries. Counting
            // them twice put the same name in two buckets and inflated every total on the screen.
            const total = res.body.reduce((sum: number, bucket: { children: unknown[] }) => sum + bucket.children.length, 0);
            expect(total).toBe(1);
        });
    });

    describe('billing follows enrolment (S4)', () => {
        it('does not invoice a family whose only child is on a trial', async () => {
            const groupId = await makeGroup();
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, status: 'TRIAL' })
                .expect(201);

            const parentId = await ownProfileId(app, parent);
            const preview = await request(app.getHttpServer())
                .post('/invoices/preview')
                .set('Authorization', admin.auth)
                .send({ parentIds: [parentId], monthIssued: '2026-03' })
                .expect(201);

            // A trial is free. Billing it would make the point of offering one collapse on the
            // first invoice.
            expect(preview.body[0]).toMatchObject({ amount: null });
        });

        it('invoices the family once the trial becomes a real enrolment', async () => {
            const groupId = await makeGroup();
            const trial = await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: await makeChild(), groupId, status: 'TRIAL' })
                .expect(201);
            await request(app.getHttpServer())
                .put(`/enrollments/${trial.body.id}/resolve-trial`)
                .set('Authorization', admin.auth)
                .send({ accepted: true })
                .expect(200);

            const parentId = await ownProfileId(app, parent);
            const preview = await request(app.getHttpServer())
                .post('/invoices/preview')
                .set('Authorization', admin.auth)
                .send({ parentIds: [parentId], monthIssued: '2026-03' })
                .expect(201);
            expect(preview.body[0]).toMatchObject({ amount: 350 });
        });

        it('does not invoice a family whose child is in no group at all', async () => {
            await makeChild();
            const parentId = await ownProfileId(app, parent);

            // This was wrong before trials existed: the price is per child attending, and a family
            // whose child had not started was being charged for them.
            const preview = await request(app.getHttpServer())
                .post('/invoices/preview')
                .set('Authorization', admin.auth)
                .send({ parentIds: [parentId], monthIssued: '2026-03' })
                .expect(201);
            expect(preview.body[0]).toMatchObject({ amount: null });
        });
    });

    describe('authorization', () => {
        it('refuses a parent everywhere, including the reads', async () => {
            const groupId = await makeGroup();
            const childId = await makeChild();

            // D2: the school decides who is in which group, and a parent has nothing to decide
            // here and nothing to see that `GET /children` does not already give them.
            await request(app.getHttpServer()).get(`/enrollments/child/${childId}`).set('Authorization', parent.auth).expect(403);
            await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', parent.auth).expect(403);
            await request(app.getHttpServer()).post('/enrollments').set('Authorization', parent.auth).send({ childId, groupId }).expect(403);
            await request(app.getHttpServer()).post('/enrollments/waitlist').set('Authorization', parent.auth).send({ childId, groupId }).expect(403);
            await request(app.getHttpServer())
                .post('/enrollments/transfer')
                .set('Authorization', parent.auth)
                .send({ childId, toGroupId: groupId })
                .expect(403);
            await request(app.getHttpServer()).get('/enrollments/demand').set('Authorization', parent.auth).expect(403);
            await request(app.getHttpServer()).get('/enrollments/trials/unresolved').set('Authorization', parent.auth).expect(403);
        });

        it('refuses an unauthenticated caller', async () => {
            await request(app.getHttpServer()).get('/enrollments/child/1').expect(401);
        });
    });
});
