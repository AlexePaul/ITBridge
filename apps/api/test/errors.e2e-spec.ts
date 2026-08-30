import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, enrolInNewGroup, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

/**
 * Cover for E05/S2. Errors used to leave the API in whatever shape Nest, TypeORM or a `throw` in a
 * service happened to produce, so the frontend had nothing to switch on — and a database failure
 * went out as a 500 carrying the driver's message, table and column names included.
 */
describe('Error shape (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
    });

    const shape = ['statusCode', 'code', 'message', 'requestId', 'path', 'timestamp'];

    it.each([
        ['401 without a token', () => request(app.getHttpServer()).get('/invoices')],
        ['404 on a missing record', () => request(app.getHttpServer()).get('/invoices/9999').set('Authorization', admin.auth)],
        ['403 on a forbidden route', () => request(app.getHttpServer()).get('/users')],
        ['400 on a validation failure', () => request(app.getHttpServer()).post('/children').set('Authorization', admin.auth).send({})],
    ])('%s carries every field of the shape', async (_label, call) => {
        const res = await call();

        for (const field of shape) {
            expect(res.body).toHaveProperty(field);
        }
        expect(res.body.statusCode).toBe(res.status);
    });

    it('gives validation failures a details array and a stable code', async () => {
        const res = await request(app.getHttpServer()).post('/children').set('Authorization', admin.auth).send({}).expect(400);

        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(Array.isArray(res.body.details)).toBe(true);
        expect(res.body.details.length).toBeGreaterThan(0);
    });

    it('omits details when the error is not a validation failure', async () => {
        const res = await request(app.getHttpServer()).get('/invoices').expect(401);

        expect(res.body.details).toBeUndefined();
    });

    it('echoes the request id in a header as well as the body', async () => {
        const res = await request(app.getHttpServer()).get('/invoices').expect(401);

        expect(res.headers['x-request-id']).toBe(res.body.requestId);
    });

    it('keeps a caller-supplied request id, so a trace survives the hop', async () => {
        const supplied = 'frontend-correlation-1234';

        const res = await request(app.getHttpServer()).get('/invoices').set('x-request-id', supplied).expect(401);

        expect(res.body.requestId).toBe(supplied);
    });

    it('refuses a caller-supplied id that is not id-shaped', async () => {
        // Otherwise a client could write arbitrary text into the logs.
        const res = await request(app.getHttpServer()).get('/invoices').set('x-request-id', 'not an id; DROP TABLE users').expect(401);

        expect(res.body.requestId).not.toContain('DROP TABLE');
    });

    it('gives every request a distinct id', async () => {
        const first = await request(app.getHttpServer()).get('/invoices').expect(401);
        const second = await request(app.getHttpServer()).get('/invoices').expect(401);

        expect(first.body.requestId).not.toBe(second.body.requestId);
    });

    describe('database errors do not reach the client', () => {
        it('turns a unique violation into a 409 with a usable code', async () => {
            const body = { firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' };
            await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send(body).expect(201);

            const res = await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send(body);

            expect(res.status).toBe(409);
            expect(res.body.code).toBeDefined();
        });

        it('never leaks SQL or driver text', async () => {
            const body = { firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' };
            await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send(body).expect(201);

            const res = await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send(body);

            // `path` legitimately contains the route, so only the human-facing parts are checked.
            const surfaced = `${res.body.message} ${JSON.stringify(res.body.details ?? [])}`;
            for (const leak of ['SELECT', 'INSERT', 'duplicate key', 'UQ_', 'constraint', 'relation']) {
                expect(surfaced).not.toContain(leak);
            }
        });

        it('translates a constraint violation raised by the database itself', async () => {
            // Not caught by a service check: this reaches Postgres and comes back as 23505, which
            // the filter has to turn into something a caller can act on. `@Unique(['parent',
            // 'monthIssued'])` on Invoice is the constraint.
            const profile = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
                .expect(201);

            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ parentId: profile.body.id, firstName: 'Maria', lastName: 'Pop', birthDate: '2016-01-01' })
                .expect(201);

            // An invoice counts active enrolments now, not children on file (E11/S4).
            await enrolInNewGroup(app, admin, [child.body.id as number]);

            const invoice = { parentIds: [profile.body.id], monthIssued: '2026-03', dateIssued: '2026-03-01' };
            await request(app.getHttpServer()).post('/invoices').set('Authorization', admin.auth).send(invoice).expect(201);

            const res = await request(app.getHttpServer()).post('/invoices').set('Authorization', admin.auth).send(invoice);

            expect(res.status).toBe(409);
            expect(res.body.code).toBe('ALREADY_EXISTS');
            expect(`${res.body.message}`).not.toContain('duplicate key');
        });
    });
});
