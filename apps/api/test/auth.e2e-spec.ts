import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, registerUser, truncateAll } from './helpers';

describe('Authentication (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
    });

    afterAll(async () => {
        await app.close();
    });

    it('registers, then calls /auth/me with the returned token', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(res.body).toMatchObject({ username: 'ana', role: 'PARENT' });
    });

    it('never returns the password hash', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('refuses a second account with the same username', async () => {
        await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/register').send({ username: 'ana', password: 'altceva' }).expect(409);
    });

    it('login with the correct password returns tokens', async () => {
        await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200);

        expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    });

    it('login with a wrong password returns 401', async () => {
        await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'gresita' }).expect(401);
    });

    it('refresh returns a fresh access token', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);

        expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('refresh with an access token instead of a refresh token returns 401', async () => {
        const user = await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: user.accessToken }).expect(401);
    });

    it('without an authorization header, /auth/me returns 401', async () => {
        await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('with a made-up token, /auth/me returns 401', async () => {
        await request(app.getHttpServer()).get('/auth/me').set('Authorization', 'Bearer nu-e-un-jwt').expect(401);
    });

    it('rejects a register body carrying an unexpected field, such as role', async () => {
        // `forbidNonWhitelisted` refuses the request outright. Previously the field was silently
        // dropped, which worked but told the caller nothing.
        const res = await request(app.getHttpServer()).post('/auth/register').send({ username: 'siret', password: 'parola123', role: 'ADMIN' }).expect(400);

        expect(JSON.stringify(res.body)).toContain('role');
    });

    it('creates a PARENT for a well-formed register body', async () => {
        const user = await registerUser(app, 'obisnuit');

        const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(me.body.role).toBe('PARENT');
    });

    it('rejects a password shorter than six characters', async () => {
        // RegisterDto has asked for six since it was written; nothing enforced it until now.
        const res = await request(app.getHttpServer()).post('/auth/register').send({ username: 'scurt', password: 'abc' }).expect(400);

        expect(JSON.stringify(res.body)).toContain('password');
    });

    it('rejects a register body with no password at all', async () => {
        await request(app.getHttpServer()).post('/auth/register').send({ username: 'fara' }).expect(400);
    });
});
