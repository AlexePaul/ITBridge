import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, truncateAll } from './helpers';

/** Cover for E05/S5 and S6. */
describe('Health and rate limiting (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp({ throttling: true }));
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await truncateAll(dataSource);
    });

    describe('/health', () => {
        it('answers without a token', async () => {
            const res = await request(app.getHttpServer()).get('/health').expect(200);

            expect(res.body.status).toBe('ok');
        });

        it('answers quickly, because it touches nothing', async () => {
            // A liveness probe that queried the database would turn a slow database into a restart
            // loop. The budget is generous; the point is that it does no I/O.
            const started = Date.now();
            await request(app.getHttpServer()).get('/health').expect(200);

            expect(Date.now() - started).toBeLessThan(200);
        });
    });

    describe('/ready', () => {
        it('reports the database as reachable', async () => {
            const res = await request(app.getHttpServer()).get('/ready').expect(200);

            expect(res.body.checks.database).toBe('ok');
        });

        it('answers 503 when the database is gone, and says nothing else', async () => {
            // Destroying the pool is the closest we get to pulling the plug without stopping the
            // container underneath the whole suite.
            await dataSource.destroy();
            try {
                const res = await request(app.getHttpServer()).get('/ready').expect(503);
                expect(JSON.stringify(res.body)).not.toContain('password');
            } finally {
                await dataSource.initialize();
            }
        });
    });

    describe('rate limiting on credential routes', () => {
        it('answers 429 once the login limit is exceeded', async () => {
            const attempt = () => request(app.getHttpServer()).post('/auth/login').send({ username: 'nimeni', password: 'gresita' });

            // The limit is 10 a minute; the eleventh is the one that must be refused.
            const codes: number[] = [];
            for (let i = 0; i < 12; i++) {
                codes.push((await attempt()).status);
            }

            expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
            expect(codes).toContain(429);
        });

        it('does not throttle ordinary reads at the same rate', async () => {
            // The global ceiling is far higher, so normal browsing is unaffected.
            for (let i = 0; i < 15; i++) {
                await request(app.getHttpServer()).get('/health').expect(200);
            }
        });
    });
});
