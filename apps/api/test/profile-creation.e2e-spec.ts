import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll } from './helpers';

/**
 * Regression cover for a bug that blocked the flow documented in CLAUDE.md, where an admin creates
 * profiles with no account and no contact details and links them later.
 *
 * `createProfile` checked uniqueness through `findOne({ where: { email: dto.email } })`. When
 * `email` was missing, TypeORM dropped the undefined condition, the query degenerated into "find
 * any profile", and the second profile without an email got a 409. Same for `phone`.
 */
describe('Creating profiles without contact details (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
    });

    const createAdmin = async () => promoteToAdmin(app, dataSource, await registerUser(app, 'admin'), 'parola123');

    it('the first profile without an email succeeds', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Ana', lastName: 'Pop' }).expect(201);
    });

    it('the second profile without an email succeeds too', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Ana', lastName: 'Pop' }).expect(201);

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Bogdan', lastName: 'Ion' }).expect(201);
    });

    it('a second profile with only an email, no phone, succeeds', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com' })
            .expect(201);

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', email: 'bogdan@example.com' })
            .expect(201);
    });

    it('a genuinely duplicated email is still rejected', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com' })
            .expect(201);

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', email: 'ana@example.com' })
            .expect(409);
    });

    it('a genuinely duplicated phone is still rejected', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', phone: '+40700000001' })
            .expect(201);

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', phone: '+40700000001' })
            .expect(409);
    });

    it('distinct email and phone both go through', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
            .expect(201);

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', email: 'bogdan@example.com', phone: '+40700000002' })
            .expect(201);
    });
});
