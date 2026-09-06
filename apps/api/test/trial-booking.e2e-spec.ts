import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Booking a trial without an account — E20/S2, and the funnel that follows from it, E20/S1 and S3.
 *
 * The two properties this suite exists to hold are the ones a unit test cannot see, because both are
 * about what happens across tables:
 *
 *  - **no account is created, and yet the seat is really taken** — the trial has to appear in the
 *    group's register and reduce the number of free seats, through the same rules an admin's
 *    enrolment goes through;
 *  - **a family is never lost** — when the room is full, the request is still on file.
 */
describe('Trial booking, public (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    /** Far enough ahead to be inside the three-week horizon the form offers. */
    const trialDate = (): string => {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    };

    const bookingBody = (overrides: Record<string, unknown> = {}) => ({
        parentName: 'Ioana Popescu',
        parentEmail: 'ioana.popescu@example.com',
        childFirstName: 'Matei',
        childLastName: 'Popescu',
        childBirthDate: '2016-04-04',
        ...overrides,
    });

    /** A location, a room, a group that fits a ten-year-old, and one class in it next week. */
    const schoolWithAClass = async (overrides: Record<string, unknown> = {}): Promise<{ groupId: number; sessionId: number }> => {
        const roomId = await createRoom(app, admin, { slug: `titan-${Date.now()}`, name: 'Titan' });
        const group = await request(app.getHttpServer())
            .post('/groups')
            .set('Authorization', admin.auth)
            .send(groupBody(roomId, { name: 'Scratch Începători', minAge: 8, maxAge: 12, ...overrides }))
            .expect(201);
        const groupId = group.body.id as number;
        const sessionId = await createClassSession(dataSource, groupId, { date: trialDate() });
        return { groupId, sessionId };
    };

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.lead'));
    });

    describe('what a stranger can see and do', () => {
        it('offers the classes a ten-year-old could come to, with no credentials at all', async () => {
            const { groupId } = await schoolWithAClass();

            const res = await request(app.getHttpServer()).get('/trial/slots').query({ birthDate: '2016-04-04' }).expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0]).toMatchObject({ groupId, groupName: 'Scratch Începători', locationName: 'Titan' });
            expect(res.body[0].sessions[0]).toMatchObject({ date: trialDate() });
        });

        it('offers nothing to a child the group is not for', async () => {
            await schoolWithAClass();

            const res = await request(app.getHttpServer()).get('/trial/slots').query({ birthDate: '2021-01-01' }).expect(200);

            expect(res.body).toEqual([]);
        });

        it('books the class, and creates no account doing it', async () => {
            const { sessionId } = await schoolWithAClass();

            const res = await request(app.getHttpServer())
                .post('/trial/bookings')
                .send(bookingBody({ classSessionId: sessionId }))
                .expect(201);

            expect(res.body).toMatchObject({ status: 'booked' });
            expect(res.body.trial).toMatchObject({ groupName: 'Scratch Începători', locationName: 'Titan' });

            // One user in the database: the admin this suite signed in as. The family that just
            // booked has none, which is the whole point of the story.
            const users = await dataSource.query<{ count: string }[]>('SELECT COUNT(*)::int AS count FROM "users"');
            expect(Number(users[0].count)).toBe(1);

            // And the shell profile carries no address, because those columns are unique and a
            // public form must not be able to write into another family's row.
            const shells = await dataSource.query<{ email: string | null; phone: string | null }[]>(
                'SELECT "email", "phone" FROM "profiles" WHERE "user_id" IS NULL',
            );
            expect(shells).toEqual([{ email: null, phone: null }]);
        });

        it('refuses a request with no way to reach the family', async () => {
            const { sessionId } = await schoolWithAClass();

            await request(app.getHttpServer())
                .post('/trial/bookings')
                .send({ ...bookingBody({ classSessionId: sessionId }), parentEmail: undefined })
                .expect(400);
        });

        it('answers a second press with the first booking rather than a second child', async () => {
            const { sessionId } = await schoolWithAClass();
            const body = bookingBody({ classSessionId: sessionId });

            const first = await request(app.getHttpServer()).post('/trial/bookings').send(body).expect(201);
            const second = await request(app.getHttpServer()).post('/trial/bookings').send(body).expect(201);

            expect(second.body.leadId).toBe(first.body.leadId);
            const children = await dataSource.query<{ count: string }[]>('SELECT COUNT(*)::int AS count FROM "children"');
            expect(Number(children[0].count)).toBe(1);
        });
    });

    describe('the seat is a real seat', () => {
        it("takes one of the room's places, so the group has one fewer to offer", async () => {
            const { groupId, sessionId } = await schoolWithAClass({ capacity: 2 });

            const before = await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', admin.auth).expect(200);
            await request(app.getHttpServer())
                .post('/trial/bookings')
                .send(bookingBody({ classSessionId: sessionId }))
                .expect(201);
            const after = await request(app.getHttpServer()).get(`/enrollments/group/${groupId}/occupancy`).set('Authorization', admin.auth).expect(200);

            expect(before.body.free).toBe(2);
            expect(after.body).toMatchObject({ taken: 1, free: 1 });
        });

        it('puts the child in the register for that class', async () => {
            const { groupId, sessionId } = await schoolWithAClass();
            await request(app.getHttpServer())
                .post('/trial/bookings')
                .send(bookingBody({ classSessionId: sessionId }))
                .expect(201);

            const register = await request(app.getHttpServer()).get(`/attendance/session/${sessionId}/register`).set('Authorization', admin.auth).expect(200);

            expect(register.body.entries.map((entry: { firstName: string }) => entry.firstName)).toContain('Matei');
            expect(register.body.session.groupId).toBe(groupId);
        });

        it('does not offer a full group, and keeps the family that asked anyway', async () => {
            const { groupId, sessionId } = await schoolWithAClass({ capacity: 1 });

            // Fill the single seat with an ordinary enrolment.
            const parent = await registerUser(app, 'parinte.plin');
            const profileId = await ownProfileId(app, parent);
            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Ionescu', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);
            await request(app.getHttpServer())
                .post('/enrollments')
                .set('Authorization', admin.auth)
                .send({ childId: child.body.id as number, groupId })
                .expect(201);

            const slots = await request(app.getHttpServer()).get('/trial/slots').query({ birthDate: '2016-04-04' }).expect(200);
            expect(slots.body).toEqual([]);

            // Somebody who had the old page open presses send anyway. Not an error: a lead.
            const res = await request(app.getHttpServer())
                .post('/trial/bookings')
                .send(bookingBody({ classSessionId: sessionId }))
                .expect(201);
            expect(res.body.status).toBe('no_seats');

            const leads = await request(app.getHttpServer()).get('/leads').set('Authorization', admin.auth).expect(200);
            expect(leads.body).toHaveLength(1);
            expect(leads.body[0]).toMatchObject({ noSeats: true, parentName: 'Ioana Popescu' });
        });

        it('hides the date a visiting child was moved onto, and keeps the next one', async () => {
            // The sharpest version of D7, and the reason seats are counted per class rather than per
            // group: a child the office moved here for the week occupies a chair for that hour
            // without being enrolled in anything. A group with one place left has none on that date.
            const { groupId } = await schoolWithAClass({ capacity: 1 });
            const nextWeek = (() => {
                const date = new Date();
                date.setDate(date.getDate() + 14);
                return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
            })();
            const secondSession = await createClassSession(dataSource, groupId, { date: nextWeek });

            const before = await request(app.getHttpServer()).get('/trial/slots').query({ birthDate: '2016-04-04' }).expect(200);
            expect(before.body[0].sessions).toHaveLength(2);

            // A visitor takes the single chair at the first class only.
            const parent = await registerUser(app, 'parinte.recuperare');
            const profileId = await ownProfileId(app, parent);
            const visitor = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Ionescu', birthDate: '2016-01-01', parentId: profileId })
                .expect(201);
            const firstSession = before.body[0].sessions[0].id as number;
            await dataSource.query(
                `INSERT INTO "absence_notices" ("child_id", "class_session_id", "reason", "inTime", "replacement_session_id")
                 VALUES ($1, $2, 'Răcit', true, $3)`,
                [visitor.body.id as number, secondSession, firstSession],
            );

            const after = await request(app.getHttpServer()).get('/trial/slots').query({ birthDate: '2016-04-04' }).expect(200);

            expect(after.body[0].sessions.map((entry: { id: number }) => entry.id)).toEqual([secondSession]);
        });

        it('keeps the family that found no hour at all, marked as such', async () => {
            const res = await request(app.getHttpServer()).post('/trial/bookings').send(bookingBody()).expect(201);

            expect(res.body.status).toBe('no_seats');
            const leads = await request(app.getHttpServer()).get('/leads').set('Authorization', admin.auth).expect(200);
            expect(leads.body[0]).toMatchObject({ noSeats: true, status: 'new' });
        });
    });

    describe('the lead follows the facts', () => {
        const bookAndMark = async (present: boolean) => {
            const { sessionId } = await schoolWithAClass();
            const booking = await request(app.getHttpServer())
                .post('/trial/bookings')
                .send(bookingBody({ classSessionId: sessionId }))
                .expect(201);

            const child = await dataSource.query<{ id: number }[]>('SELECT "id" FROM "children" LIMIT 1');
            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${child[0].id}`)
                .set('Authorization', admin.auth)
                .send({ present })
                .expect(200);

            return { leadId: booking.body.leadId as number, childId: child[0].id, sessionId };
        };

        it('moves to „probă ținută" when the register says the child came — no separate tick', async () => {
            const { leadId } = await bookAndMark(true);

            const lead = await request(app.getHttpServer()).get(`/leads/${leadId}`).set('Authorization', admin.auth).expect(200);
            expect(lead.body.status).toBe('trial_held');
            expect(lead.body.trialHeldAt).not.toBeNull();
        });

        it('moves back when the mark was a mistap corrected to absent', async () => {
            const { leadId, childId, sessionId } = await bookAndMark(true);

            await request(app.getHttpServer())
                .put(`/attendance/session/${sessionId}/child/${childId}`)
                .set('Authorization', admin.auth)
                .send({ present: false })
                .expect(200);

            const lead = await request(app.getHttpServer()).get(`/leads/${leadId}`).set('Authorization', admin.auth).expect(200);
            expect(lead.body.status).toBe('trial_scheduled');
        });

        it('records „înscris" when E11 turns the trial into an enrolment, and nowhere else', async () => {
            const { leadId } = await bookAndMark(true);
            const enrollment = await dataSource.query<{ id: number }[]>(`SELECT "id" FROM "enrollments" WHERE "status" = 'TRIAL' LIMIT 1`);

            await request(app.getHttpServer())
                .put(`/enrollments/${enrollment[0].id}/resolve-trial`)
                .set('Authorization', admin.auth)
                .send({ accepted: true })
                .expect(200);

            const lead = await request(app.getHttpServer()).get(`/leads/${leadId}`).set('Authorization', admin.auth).expect(200);
            expect(lead.body.status).toBe('enrolled');
            expect(lead.body.decidedAt).not.toBeNull();
        });

        it('records the loss, with the reason, when the trial is closed instead', async () => {
            const { leadId } = await bookAndMark(true);
            const enrollment = await dataSource.query<{ id: number }[]>(`SELECT "id" FROM "enrollments" WHERE "status" = 'TRIAL' LIMIT 1`);

            await request(app.getHttpServer())
                .put(`/enrollments/${enrollment[0].id}/resolve-trial`)
                .set('Authorization', admin.auth)
                .send({ accepted: false, reason: 'Programul nu li se potrivește' })
                .expect(200);

            const lead = await request(app.getHttpServer()).get(`/leads/${leadId}`).set('Authorization', admin.auth).expect(200);
            expect(lead.body).toMatchObject({ status: 'lost', lostReason: 'Programul nu li se potrivește' });
        });
    });

    describe('who may look at the funnel', () => {
        it('refuses a parent the list of leads — it is other families contact details', async () => {
            const parent = await registerUser(app, 'parinte.curios.lead');
            await request(app.getHttpServer()).get('/leads').set('Authorization', parent.auth).expect(403);
            await request(app.getHttpServer()).get('/reports/funnel').set('Authorization', parent.auth).expect(403);
        });

        it('counts what happened, on the arrival cohort', async () => {
            const { sessionId } = await schoolWithAClass();
            await request(app.getHttpServer())
                .post('/trial/bookings')
                .send(bookingBody({ classSessionId: sessionId }))
                .expect(201);
            await request(app.getHttpServer())
                .post('/trial/bookings')
                .send(bookingBody({ parentEmail: 'alta@example.com', childFirstName: 'Ana' }))
                .expect(201);

            const funnel = await request(app.getHttpServer()).get('/reports/funnel').set('Authorization', admin.auth).expect(200);

            expect(funnel.body.stages).toMatchObject({ requests: 2, trialsScheduled: 1, noSeats: 1 });
            // The family nobody could seat is outside every rate — that is what makes them
            // invisible without this figure, and why S4 asks for it separately.
            expect(funnel.body.rates.requestToTrial).toBe(50);
            expect(funnel.body.unmetByBand[0]).toMatchObject({ count: 1 });
        });
    });
});
