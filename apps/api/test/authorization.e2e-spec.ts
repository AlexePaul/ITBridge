import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClassSession, createRoom, createTestApp, groupBody, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

/**
 * Row-level authorization, verified over HTTP. The unit tests show the queries *contain* the
 * narrowing; here we check its effect: two real parents, with real data, and neither may see the
 * other's.
 *
 * The distinction matters because the narrowing lives in the service, not in the guard — so
 * correct guards guarantee nothing about the data.
 */
describe('Row-level authorization (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    let admin: TestUser;
    let ana: TestUser;
    let bogdan: TestUser;
    let anaProfileId: number;
    let bogdanProfileId: number;
    let anaInvoiceId: number;
    let mariaId: number;
    let raduId: number;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);

        const root = await registerUser(app, 'admin');
        admin = await promoteToAdmin(app, dataSource, root);
        ana = await registerUser(app, 'ana');
        bogdan = await registerUser(app, 'bogdan');

        // Distinct email and phone are mandatory: see profile-creation.e2e-spec.ts. A profile with
        // no contact details makes the uniqueness check answer 409 for the second one.
        // Registration writes the profile (E11/S2), so there is nothing left to create here — and
        // trying would be a 409 on the unique email rather than a second profile.
        anaProfileId = await ownProfileId(app, ana);
        bogdanProfileId = await ownProfileId(app, bogdan);

        mariaId = await createChild(ana, anaProfileId, 'Maria');
        raduId = await createChild(bogdan, bogdanProfileId, 'Radu');

        anaInvoiceId = await createInvoice(anaProfileId);
    });

    const createChild = async (user: TestUser, parentId: number, firstName: string): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', user.auth)
            .send({ parentId, firstName, lastName: 'Test', birthDate: '2015-05-05' })
            .expect(201);
        return res.body.id as number;
    };

    const createInvoice = async (parentId: number): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/invoices')
            .set('Authorization', admin.auth)
            .send({ parentIds: [parentId], monthIssued: '2026-03', dateIssued: '2026-03-01' });

        if (res.status !== 201) {
            throw new Error(`POST /invoices pentru parentId=${parentId} a dat ${res.status}: ${JSON.stringify(res.body)}`);
        }
        return res.body[0].id as number;
    };

    describe('invoices', () => {
        it("an admin sees everyone's invoices", async () => {
            const res = await request(app.getHttpServer()).get('/invoices').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(1);
        });

        it('a parent sees their own invoices', async () => {
            const res = await request(app.getHttpServer()).get('/invoices').set('Authorization', ana.auth).expect(200);
            expect(res.body).toHaveLength(1);
        });

        it("a parent does not see another parent's invoices in the list", async () => {
            const res = await request(app.getHttpServer()).get('/invoices').set('Authorization', bogdan.auth).expect(200);
            expect(res.body).toHaveLength(0);
        });

        it("a parent cannot fetch someone else's invoice directly, not even by id", async () => {
            await request(app.getHttpServer()).get(`/invoices/${anaInvoiceId}`).set('Authorization', bogdan.auth).expect(404);
        });

        it('an explicit filter on another parent opens nothing', async () => {
            const res = await request(app.getHttpServer()).get('/invoices').query({ parentId: anaProfileId }).set('Authorization', bogdan.auth).expect(200);

            expect(res.body).toHaveLength(0);
        });

        it('a parent cannot issue invoices', async () => {
            await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', ana.auth)
                .send({ parentIds: [bogdanProfileId], monthIssued: '2026-04', dateIssued: '2026-04-01' })
                .expect(403);
        });

        it('a parent cannot update an invoice, not even their own', async () => {
            await request(app.getHttpServer()).put(`/invoices/${anaInvoiceId}`).set('Authorization', ana.auth).send({ status: 'paid' }).expect(403);
        });

        it('a parent cannot delete an invoice', async () => {
            await request(app.getHttpServer()).delete(`/invoices/${anaInvoiceId}`).set('Authorization', ana.auth).expect(403);
        });
    });

    describe('children', () => {
        it('a parent sees their own children', async () => {
            const res = await request(app.getHttpServer()).get('/children').set('Authorization', ana.auth).expect(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].firstName).toBe('Maria');
        });

        it("a parent does not see another parent's children", async () => {
            const res = await request(app.getHttpServer()).get('/children').set('Authorization', bogdan.auth).expect(200);
            expect(res.body.map((c: { firstName: string }) => c.firstName)).not.toContain('Maria');
        });

        it('an admin sees every child', async () => {
            const res = await request(app.getHttpServer()).get('/children').set('Authorization', admin.auth).expect(200);
            expect(res.body).toHaveLength(2);
        });

        it("a parent cannot add a child to someone else's profile", async () => {
            await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', bogdan.auth)
                .send({ parentId: anaProfileId, firstName: 'Intrus', lastName: 'X', birthDate: '2016-01-01' })
                .expect(403);
        });
    });

    describe('profiles', () => {
        it('a parent sees only their own profile', async () => {
            const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', ana.auth).expect(200);
            expect(res.body).toHaveLength(1);
            expect(res.body[0].id).toBe(anaProfileId);
        });

        it('a filter on another user opens nothing', async () => {
            const res = await request(app.getHttpServer()).get('/profiles').query({ userId: ana.userId }).set('Authorization', bogdan.auth).expect(200);

            expect(res.body.every((p: { id: number }) => p.id === bogdanProfileId)).toBe(true);
        });

        it('an admin sees every profile', async () => {
            const res = await request(app.getHttpServer()).get('/profiles').set('Authorization', admin.auth).expect(200);
            expect(res.body.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('attendance', () => {
        // The register moved onto `ClassSession`, so the fixtures did too: a group, a session of
        // that group, and marks posted against the session id. What is being checked has not
        // moved — a parent reads their own child's attendance and nobody else's.
        let classSessionId: number;

        beforeEach(async () => {
            const roomId = await createRoom(app, admin);
            const group = await request(app.getHttpServer()).post('/groups').set('Authorization', admin.auth).send(groupBody(roomId)).expect(201);
            const groupId = group.body.id as number;

            // No endpoint puts a child in a group yet, so this is the direct route. Enrolment
            // arrives with E11.
            await dataSource.query('UPDATE children SET group_id = $1 WHERE id = ANY($2)', [groupId, [mariaId, raduId]]);

            classSessionId = await createClassSession(dataSource, groupId);

            await request(app.getHttpServer())
                .post(`/attendance/session/${classSessionId}`)
                .set('Authorization', admin.auth)
                .send({
                    childrenAttendance: [
                        { childId: mariaId, present: true },
                        { childId: raduId, present: false },
                    ],
                })
                .expect(201);
        });

        it("a parent reads their own child's attendance, and gets the class along with it", async () => {
            const res = await request(app.getHttpServer()).get(`/attendance/child/${mariaId}`).set('Authorization', ana.auth).expect(200);

            expect(res.body).toHaveLength(1);
            expect(res.body[0].present).toBe(true);
            // The date and the hours are only on the session now — a record without it would say
            // "present" with no answer to "at what?".
            expect(res.body[0].classSession.id).toBe(classSessionId);
            expect(res.body[0].classSession.date).toBe('2026-03-10');
            expect(res.body[0].classSession.room.location).toBeTruthy();
            expect(res.body[0].date).toBeUndefined();
        });

        it("a parent cannot read another parent's child's attendance", async () => {
            await request(app.getHttpServer()).get(`/attendance/child/${raduId}`).set('Authorization', ana.auth).expect(403);
        });

        it("an admin reads anyone's attendance", async () => {
            await request(app.getHttpServer()).get(`/attendance/child/${raduId}`).set('Authorization', admin.auth).expect(200);
        });

        it('a parent cannot mark attendance', async () => {
            await request(app.getHttpServer())
                .post(`/attendance/session/${classSessionId}`)
                .set('Authorization', ana.auth)
                .send({ childrenAttendance: [{ childId: mariaId, present: true }] })
                .expect(403);
        });

        it('marking the same session twice is refused', async () => {
            await request(app.getHttpServer())
                .post(`/attendance/session/${classSessionId}`)
                .set('Authorization', admin.auth)
                .send({
                    childrenAttendance: [
                        { childId: mariaId, present: true },
                        { childId: raduId, present: true },
                    ],
                })
                .expect(409);
        });

        it('a class session that does not exist is a 404, not a row written against nothing', async () => {
            await request(app.getHttpServer())
                .post('/attendance/session/999999')
                .set('Authorization', admin.auth)
                .send({ childrenAttendance: [{ childId: mariaId, present: true }] })
                .expect(404);
        });

        it('a cancelled session cannot be marked', async () => {
            const cancelled = await createClassSession(dataSource, (await groupOf(mariaId)) as number, { date: '2026-03-17', status: 'cancelled' });

            await request(app.getHttpServer())
                .post(`/attendance/session/${cancelled}`)
                .set('Authorization', admin.auth)
                .send({
                    childrenAttendance: [
                        { childId: mariaId, present: true },
                        { childId: raduId, present: true },
                    ],
                })
                .expect(400);
        });

        const groupOf = async (childId: number): Promise<number | null> => {
            const rows = await dataSource.query<{ group_id: number | null }[]>('SELECT group_id FROM children WHERE id = $1', [childId]);
            return rows[0].group_id;
        };
    });

    describe('admin-only endpoints', () => {
        it.each([
            ['GET', '/users'],
            ['GET', '/users/without-profile'],
        ])('%s %s refuses a PARENT with 403', async (method, path) => {
            await request(app.getHttpServer())[method.toLowerCase() as 'get'](path).set('Authorization', ana.auth).expect(403);
        });

        it.each([
            ['POST', '/groups'],
            ['POST', '/discounts'],
            ['POST', '/locations'],
            ['POST', '/rooms'],
        ])('%s %s refuses a PARENT with 403', async (_method, path) => {
            await request(app.getHttpServer()).post(path).set('Authorization', ana.auth).send({}).expect(403);
        });

        it('the same endpoints answer an admin', async () => {
            await request(app.getHttpServer()).get('/users').set('Authorization', admin.auth).expect(200);
        });
    });

    describe('without authentication', () => {
        it.each([['/invoices'], ['/children'], ['/profiles'], ['/users'], ['/locations'], ['/rooms']])('GET %s returns 401', async (path) => {
            await request(app.getHttpServer()).get(path).expect(401);
        });
    });
});
