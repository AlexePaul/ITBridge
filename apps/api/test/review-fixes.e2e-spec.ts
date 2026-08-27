import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

/** Regression cover for the defects the code review turned up. */
describe('Review findings (e2e)', () => {
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

    describe('a partial update leaves the fields it did not mention alone', () => {
        it('on a group', async () => {
            // `Object.assign(entity, dto)` copied the DTO's undefined-valued keys over the entity,
            // so everything the request stayed silent about came back null — the row survived,
            // because TypeORM skips undefined on save, but the response was a blanked record.
            const created = await request(app.getHttpServer())
                .post('/groups')
                .set('Authorization', admin.auth)
                .send({ weekday: 1, startTime: '16:00', endTime: '17:30', minAge: 7, maxAge: 10 })
                .expect(201);

            const res = await request(app.getHttpServer()).put(`/groups/${created.body.id}`).set('Authorization', admin.auth).send({ weekday: 5 }).expect(200);

            expect(res.body.weekday).toBe(5);
            // Postgres `time` columns come back with seconds.
            expect(res.body.startTime).toBe('16:00:00');
            expect(res.body.endTime).toBe('17:30:00');
            expect(res.body.isActive).toBe(true);
        });

        it('on a child', async () => {
            const profile = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
                .expect(201);

            const child = await request(app.getHttpServer())
                .post('/children')
                .set('Authorization', admin.auth)
                .send({ parentId: profile.body.id, firstName: 'Maria', lastName: 'Pop', birthDate: '2016-04-04' })
                .expect(201);

            const res = await request(app.getHttpServer())
                .put(`/children/${child.body.id}`)
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ioana' })
                .expect(200);

            expect(res.body.firstName).toBe('Ioana');
            expect(res.body.lastName).toBe('Pop');
            expect(res.body.birthDate).toBeTruthy();
        });

        it('on a profile', async () => {
            const profile = await request(app.getHttpServer())
                .post('/profiles')
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
                .expect(201);

            const res = await request(app.getHttpServer())
                .put(`/profiles/${profile.body.id}`)
                .set('Authorization', admin.auth)
                .send({ firstName: 'Ioana' })
                .expect(200);

            expect(res.body.firstName).toBe('Ioana');
            expect(res.body.lastName).toBe('Pop');
            expect(res.body.email).toBe('ana@example.com');
        });
    });

    describe('an error body is no less careful than the log', () => {
        it('redacts sensitive query values in path', async () => {
            const res = await request(app.getHttpServer()).get('/profiles?email=ana.popescu@example.com&phone=%2B40721000001').expect(401);

            expect(res.body.path).not.toContain('ana.popescu@example.com');
            expect(res.body.path).toContain('email=[redacted]');
            expect(res.body.path).toContain('phone=[redacted]');
        });

        it('leaves ordinary query values readable', async () => {
            const res = await request(app.getHttpServer()).get('/invoices?status=paid').expect(401);

            expect(res.body.path).toContain('status=paid');
        });
    });

    describe('issuing invoices is all-or-nothing across the batch', () => {
        it('commits nothing when one parent in the batch fails', async () => {
            const parents: number[] = [];
            for (const name of ['Ana', 'Bogdan']) {
                const profile = await request(app.getHttpServer())
                    .post('/profiles')
                    .set('Authorization', admin.auth)
                    .send({
                        firstName: name,
                        lastName: 'Pop',
                        email: `${name.toLowerCase()}@example.com`,
                        phone: `+4070000000${parents.length + 1}`,
                    })
                    .expect(201);
                parents.push(profile.body.id as number);

                await request(app.getHttpServer())
                    .post('/children')
                    .set('Authorization', admin.auth)
                    .send({ parentId: profile.body.id, firstName: 'C', lastName: 'Pop', birthDate: '2016-01-01' })
                    .expect(201);
            }

            // The second parent already has an invoice for the month, so the batch trips the unique
            // constraint partway through. The first parent's invoice must not survive that.
            await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', admin.auth)
                .send({ parentIds: [parents[1]], monthIssued: '2026-03', dateIssued: '2026-03-01' })
                .expect(201);

            await request(app.getHttpServer())
                .post('/invoices')
                .set('Authorization', admin.auth)
                .send({ parentIds: parents, monthIssued: '2026-03', dateIssued: '2026-03-01' })
                .expect(409);

            const rows = await dataSource.query<{ count: string }[]>(`SELECT count(*) FROM invoices WHERE parent_id = $1`, [parents[0]]);
            expect(rows[0].count).toBe('0');
        });
    });

    describe('refresh token rotation is claimed atomically', () => {
        it('only one of several concurrent refreshes succeeds', async () => {
            const user = await registerUser(app, 'concurent');

            const results = await Promise.all(
                Array.from({ length: 5 }, () => request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: user.refreshToken })),
            );

            // Exactly one may mint a successor. Before the conditional update, two could both read
            // `revokedAt === null` and both succeed, leaving one login with two live tokens and the
            // reuse detection never firing.
            expect(results.filter((r) => r.status === 200)).toHaveLength(1);
            expect(results.filter((r) => r.status === 401)).toHaveLength(4);
        });
    });
});
