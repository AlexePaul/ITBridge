import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, registerUser, truncateAll } from './helpers';

describe('Autentificare (e2e)', () => {
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

    it('înregistrare, apoi /auth/me cu tokenul primit', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(res.body).toMatchObject({ username: 'ana', role: 'PARENT' });
    });

    it('nu întoarce niciodată hash-ul parolei', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', user.auth).expect(200);

        expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('refuză un al doilea cont cu același username', async () => {
        await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/register').send({ username: 'ana', password: 'altceva' }).expect(409);
    });

    it('login cu parola corectă întoarce tokenuri', async () => {
        await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200);

        expect(res.body).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    });

    it('login cu parola greșită întoarce 401', async () => {
        await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'gresita' }).expect(401);
    });

    it('refresh întoarce un access token nou', async () => {
        const user = await registerUser(app, 'ana');

        const res = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: user.refreshToken }).expect(200);

        expect(res.body.accessToken).toEqual(expect.any(String));
    });

    it('refresh cu un access token în loc de refresh token întoarce 401', async () => {
        const user = await registerUser(app, 'ana');

        await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken: user.accessToken }).expect(401);
    });

    it('fără header de autorizare, /auth/me întoarce 401', async () => {
        await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('cu un token inventat, /auth/me întoarce 401', async () => {
        await request(app.getHttpServer()).get('/auth/me').set('Authorization', 'Bearer nu-e-un-jwt').expect(401);
    });

    it('register creează întotdeauna PARENT, chiar dacă cererea cere ADMIN', async () => {
        const res = await request(app.getHttpServer()).post('/auth/register').send({ username: 'siret', password: 'parola123', role: 'ADMIN' }).expect(201);

        const me = await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);

        expect(me.body.role).toBe('PARENT');
    });
});
