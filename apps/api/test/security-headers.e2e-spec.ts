import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, ownProfileId, promoteToAdmin, registerUser, TestUser, truncateAll } from './helpers';
import { DEFAULT_CACHE_CONTROL, SECURITY_HEADERS } from 'src/common/security-headers.middleware';

/**
 * What every API response carries — `SecurityHeadersMiddleware`, the API's half of the headers the
 * public site already sends. Over HTTP, because a middleware that is registered for the wrong routes,
 * or replaced by a handler, looks exactly like one that works until somebody reads the response.
 */
describe('Security headers (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;

    /** A real 1x1 PNG, so the thumbnail pipeline runs for real. */
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

    const expectHardened = (headers: Record<string, string | undefined>) => {
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(headers[name]).toBe(value);
        expect(headers['x-powered-by']).toBeUndefined();
    };

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin.headers'));
    });

    afterAll(async () => {
        await app.close();
    });

    it('hardens a public route, and says nothing about Express', async () => {
        const res = await request(app.getHttpServer()).get('/health').expect(200);
        expectHardened(res.headers);
        expect(res.headers['cache-control']).toBe(DEFAULT_CACHE_CONTROL);
    });

    it("keeps a family's data out of the browser's disk cache", async () => {
        const res = await request(app.getHttpServer()).get('/auth/me').set('Authorization', admin.auth).expect(200);
        expectHardened(res.headers);
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('hardens a refusal and a route that does not exist as well', async () => {
        expectHardened((await request(app.getHttpServer()).get('/auth/me').expect(401)).headers);
        expectHardened((await request(app.getHttpServer()).get('/nu-exista').expect(404)).headers);
    });

    /** The default gives way to a handler that asks for caching — the one that does is the thumbnail. */
    it("lets a handler set its own caching: the thumbnail's", async () => {
        const parent = await registerUser(app, 'parinte.headers');
        const child = await request(app.getHttpServer())
            .post('/children')
            .set('Authorization', admin.auth)
            .send({ parentId: await ownProfileId(app, parent), firstName: 'Andrei', lastName: 'Pop', birthDate: '2015-05-05' })
            .expect(201);
        const project = await request(app.getHttpServer())
            .post('/projects/ingest')
            .set('Authorization', admin.auth)
            .field('childId', String(child.body.id as number))
            .field('capturedOn', '2026-09-14')
            .attach('file', PNG, 'robot.png')
            .expect(201);

        const res = await request(app.getHttpServer())
            .get(`/projects/${project.body.projectId ?? project.body.id}/thumbnail`)
            .set('Authorization', admin.auth)
            .expect(200);

        expect(res.headers['cache-control']).toBe('private, max-age=3600');
        expect(res.headers['strict-transport-security']).toBe(SECURITY_HEADERS['strict-transport-security']);
    });
});
