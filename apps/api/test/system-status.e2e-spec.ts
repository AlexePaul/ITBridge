import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, promoteToAdmin, registerUser, truncateAll, TestUser } from './helpers';

/**
 * `/admin/sistem` — the configuration as the office reads it. What matters is that it is read from
 * the running backend, through the functions the rest of the code uses: the schema this database is
 * at, the bucket this process can reach, the address its email links are built from.
 */
describe('System status (e2e)', () => {
    let app: INestApplication<App>;
    let dataSource: DataSource;
    let admin: TestUser;
    let parent: TestUser;
    let env: NodeJS.ProcessEnv;

    beforeAll(async () => {
        ({ app, dataSource } = await createTestApp());
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        env = { ...process.env };
        await truncateAll(dataSource);
        admin = await promoteToAdmin(app, dataSource, await registerUser(app, 'admin'));
        parent = await registerUser(app, 'parinte');
    });

    afterEach(() => {
        process.env = env;
    });

    const status = async () => {
        const res = await request(app.getHttpServer()).get('/system/status').set('Authorization', admin.auth).expect(200);
        return res.body as Record<string, any>;
    };

    it('reads the schema from the database: every migration in this build has run', async () => {
        const body = await status();

        const [{ count }] = await dataSource.query<{ count: string }[]>('SELECT count(*)::int AS count FROM migrations');
        expect(body.migrations).toMatchObject({ applied: Number(count), pending: [] });
        expect(body.migrations.last).toMatch(/\d{13}$/);
        expect(body.notes).not.toContainEqual(expect.objectContaining({ code: 'MIGRATIONS_PENDING' }));
    });

    it('names a migration that has not run, as a problem', async () => {
        const [{ name }] = await dataSource.query<{ name: string }[]>('SELECT name FROM migrations ORDER BY "timestamp" DESC LIMIT 1');
        await dataSource.query('DELETE FROM migrations WHERE name = $1', [name]);
        try {
            const body = await status();
            expect(body.migrations.pending).toEqual([name]);
            expect(body.notes).toContainEqual({ level: 'problem', code: 'MIGRATIONS_PENDING' });
        } finally {
            await dataSource.query('INSERT INTO migrations ("timestamp", name) VALUES ($1, $2)', [Number(name.slice(-13)), name]);
        }
    });

    it('reports the bucket it reaches, and never a key', async () => {
        process.env.MAIL_RESEND_API_KEY = 're_not_a_real_key_1234567890';
        process.env.MAIL_FROM = 'IT Bridge School <notificari@example.com>';

        const res = await request(app.getHttpServer()).get('/system/status').set('Authorization', admin.auth).expect(200);

        expect(res.body.storage).toEqual({ bucket: process.env.AWS_S3_BUCKET, reachable: true });
        expect(res.body.mail.providerConfigured).toBe(true);
        expect(res.text).not.toContain('re_not_a_real_key');
    });

    it('builds the address from SITE_URL, the one every email link is built from', async () => {
        process.env.SITE_URL = 'https://stage.itbridgeschool.com/';
        expect(await status()).toMatchObject({ siteUrl: 'https://stage.itbridgeschool.com', siteUrlConfigured: true });

        delete process.env.SITE_URL;
        expect(await status()).toMatchObject({ siteUrl: 'https://itbridgeschool.com', siteUrlConfigured: false });
    });

    it('is the office’s: a parent is refused and a visitor is asked to sign in', async () => {
        await request(app.getHttpServer()).get('/system/status').set('Authorization', parent.auth).expect(403);
        await request(app.getHttpServer()).get('/system/status').expect(401);
    });
});
