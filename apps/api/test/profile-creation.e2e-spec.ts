import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll } from './helpers';

/**
 * Bug: `createProfile` checks uniqueness through
 * `findOne({ where: { email: createProfileDto.email } })`. When `email` is missing, TypeORM drops
 * the undefined condition, the query degenerates into "find any profile", and the second profile
 * without an email gets a 409. Same for `phone`.
 *
 * This blocks exactly the flow documented in CLAUDE.md: an admin creates profiles with no account
 * and no contact details, linking them later.
 *
 * The tests describe the desired behaviour and are marked `.failing` while the bug exists — they
 * turn red the moment it is fixed. The fix belongs to E05, not to this PR.
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

    it.failing('the second profile without an email should succeed too', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Ana', lastName: 'Pop' }).expect(201);

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Bogdan', lastName: 'Ion' }).expect(201);
    });

    it('documents the current behaviour: the second one gets a 409', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Ana', lastName: 'Pop' }).expect(201);

        await request(app.getHttpServer()).post('/profiles').set('Authorization', admin.auth).send({ firstName: 'Bogdan', lastName: 'Ion' }).expect(409);
    });

    it('a distinct email is not enough: the phone check degenerates the same way', async () => {
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
            .expect(409);
    });

    it('only distinct email AND phone let both through - which is why the bug went unnoticed', async () => {
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
