import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';

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
        anaProfileId = await createProfile(ana, 'Ana', 'Pop', 'ana@example.com', '+40700000001');
        bogdanProfileId = await createProfile(bogdan, 'Bogdan', 'Ion', 'bogdan@example.com', '+40700000002');

        await createChild(ana, anaProfileId, 'Maria');
        await createChild(bogdan, bogdanProfileId, 'Radu');

        anaInvoiceId = await createInvoice(anaProfileId);
    });

    const createProfile = async (user: TestUser, firstName: string, lastName: string, email: string, phone: string): Promise<number> => {
        const res = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', user.auth)
            .send({ firstName, lastName, email, phone })
            .expect(201);
        return res.body.id as number;
    };

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
