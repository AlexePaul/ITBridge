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

        const res = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', email: 'ana@example.com' })
            .expect(409);

        // Named, so the office's form can say which field belongs to another family.
        expect(res.body.code).toBe('PROFILE_EMAIL_TAKEN');
    });

    it('a genuinely duplicated phone is still rejected', async () => {
        const admin = await createAdmin();

        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', phone: '+40700000001' })
            .expect(201);

        const res = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', phone: '+40700000001' })
            .expect(409);

        expect(res.body.code).toBe('PROFILE_PHONE_TAKEN');
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

    /**
     * One number, however it is typed. The portal's setup form normalised to `+40…` in the browser
     * and the office's family forms did not, so the duplicate check — a string comparison — let a
     * second family hold a number the first already had, written the local way.
     */
    it('stores a number in one spelling, so a second spelling of it is the same number', async () => {
        const admin = await createAdmin();

        const first = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', phone: '0700 000 001' })
            .expect(201);
        expect(first.body.phone).toBe('+40700000001');

        const second = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion', phone: '0700000001' })
            .expect(409);
        expect(second.body.code).toBe('PROFILE_PHONE_TAKEN');
    });

    it("refuses an edit that takes another family's number or address, naming which", async () => {
        const admin = await createAdmin();
        await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', phone: '+40700000001' })
            .expect(201);
        const bogdan = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Bogdan', lastName: 'Ion' })
            .expect(201);
        const bogdanId = bogdan.body.id as number;

        const byPhone = await request(app.getHttpServer())
            .put(`/profiles/${bogdanId}`)
            .set('Authorization', admin.auth)
            .send({ phone: '0700-000-001' })
            .expect(409);
        expect(byPhone.body.code).toBe('PROFILE_PHONE_TAKEN');

        const byEmail = await request(app.getHttpServer())
            .put(`/profiles/${bogdanId}`)
            .set('Authorization', admin.auth)
            .send({ email: 'ANA@example.com' })
            .expect(409);
        expect(byEmail.body.code).toBe('PROFILE_EMAIL_TAKEN');
    });

    it('a number that is not one is still refused by name, not rewritten into one', async () => {
        const admin = await createAdmin();

        const res = await request(app.getHttpServer())
            .post('/profiles')
            .set('Authorization', admin.auth)
            .send({ firstName: 'Ana', lastName: 'Pop', phone: 'nu-e-telefon' })
            .expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
    });
});
