import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, registrationBody, truncateAll } from './helpers';

/**
 * Cover for E05/S7. Refresh tokens used to be purely stateless: valid for seven days, with no
 * logout and no revocation list. A stolen token stayed usable for a week no matter what anyone did.
 */
describe('Sessions and logout (e2e)', () => {
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

    const register = async (username = 'ana') => {
        const res = await request(app.getHttpServer()).post('/auth/register').send(registrationBody(username)).expect(201);
        return res.body as { accessToken: string; refreshToken: string };
    };

    const refresh = (refreshToken: string) => request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

    it('a refresh returns a new refresh token, not the same one', async () => {
        const { refreshToken } = await register();

        const res = await refresh(refreshToken).expect(200);

        expect(res.body.refreshToken).toBeDefined();
        expect(res.body.refreshToken).not.toBe(refreshToken);
    });

    it('the rotated token stops working', async () => {
        const { refreshToken } = await register();
        await refresh(refreshToken).expect(200);

        // A signature that still verifies is no longer enough: the token also has to be the live
        // one for its session.
        await refresh(refreshToken).expect(401);
    });

    it('the new token works', async () => {
        const { refreshToken } = await register();
        const rotated = (await refresh(refreshToken).expect(200)).body.refreshToken as string;

        await refresh(rotated).expect(200);
    });

    it('reusing a consumed token revokes the whole chain', async () => {
        // The signal of theft: the legitimate client and the attacker cannot both hold the newest
        // token, so a replay means somebody copied one. Everything descended from that login goes.
        const { refreshToken } = await register();
        const second = (await refresh(refreshToken).expect(200)).body.refreshToken as string;

        await refresh(refreshToken).expect(401); // the replay
        await refresh(second).expect(401); // ...takes the live token with it
    });

    describe('logout', () => {
        it('makes the refresh token unusable immediately', async () => {
            const { refreshToken } = await register();

            await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken }).expect(200);

            await refresh(refreshToken).expect(401);
        });

        it('works without an access token, because that one may already have expired', async () => {
            const { refreshToken } = await register();

            await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken }).expect(200);
        });

        it('is idempotent', async () => {
            const { refreshToken } = await register();

            await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken }).expect(200);
            await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken }).expect(200);
        });

        it('leaves other sessions of the same user alone', async () => {
            await register();
            const first = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200)).body as {
                refreshToken: string;
            };
            const second = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200)).body as {
                refreshToken: string;
            };

            await request(app.getHttpServer()).post('/auth/logout').send({ refreshToken: first.refreshToken }).expect(200);

            await refresh(first.refreshToken).expect(401);
            await refresh(second.refreshToken).expect(200);
        });
    });

    describe('sessions a parent can see and end', () => {
        it('lists the active ones', async () => {
            const { accessToken } = await register();
            await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200);

            const res = await request(app.getHttpServer()).get('/auth/sessions').set('Authorization', `Bearer ${accessToken}`).expect(200);

            expect(res.body).toHaveLength(2);
        });

        it('never returns the token or its hash', async () => {
            const { accessToken } = await register();

            const res = await request(app.getHttpServer()).get('/auth/sessions').set('Authorization', `Bearer ${accessToken}`).expect(200);

            expect(JSON.stringify(res.body)).not.toContain('tokenHash');
            expect(res.body[0]).toEqual({
                id: expect.any(Number),
                createdAt: expect.any(String),
                expiresAt: expect.any(String),
                // supertest sends no User-Agent, so null is the honest value here.
                userAgent: null,
            });
        });

        it('log out everywhere ends all of them at once', async () => {
            const { accessToken } = await register();
            const other = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'ana', password: 'parola123' }).expect(200)).body as {
                refreshToken: string;
            };

            await request(app.getHttpServer()).post('/auth/logout-all').set('Authorization', `Bearer ${accessToken}`).expect(200);

            await refresh(other.refreshToken).expect(401);
        });

        /**
         * A refresh in flight at the moment the family ends every session. The sweep was one UPDATE:
         * under READ COMMITTED it waited on the session row the rotation had locked, skipped it once
         * it came back revoked, and never saw the successor, which committed after its snapshot. The
         * new token then lived its seven days through "log out everywhere", a reset or a change of
         * password — the three moments somebody is trying to shut a thief out.
         *
         * The interleaving is forced rather than hoped for. A second connection holds the account
         * row, which stops the rotation exactly between revoking the old row and writing the new one:
         * inserting a session checks its foreign key against that row. The sweep starts while the
         * rotation waits there, and the row is let go once both are queued.
         */
        it('log out everywhere also ends a refresh that was in flight at that moment', async () => {
            const { accessToken, refreshToken } = await register();
            const [{ user_id: userId }] = await dataSource.query<{ user_id: number }[]>('SELECT user_id FROM sessions');

            const blocked = async (count: number) => {
                for (let attempt = 0; attempt < 200; attempt++) {
                    const [{ waiting }] = await dataSource.query<{ waiting: string }[]>('SELECT COUNT(*) AS waiting FROM pg_locks WHERE NOT granted');
                    if (Number(waiting) >= count) return;
                    await new Promise((resolve) => setTimeout(resolve, 10));
                }
                throw new Error(`Expected ${count} statement(s) waiting on a lock`);
            };

            const holder = dataSource.createQueryRunner();
            await holder.connect();
            await holder.startTransaction();
            let refreshed: request.Response;
            try {
                await holder.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [userId]);

                // `then` is what sends a supertest request; without it nothing leaves until awaited.
                const refreshing = refresh(refreshToken).then((res) => res);
                await blocked(1);
                const endingAll = request(app.getHttpServer())
                    .post('/auth/logout-all')
                    .set('Authorization', `Bearer ${accessToken}`)
                    .then((res) => res);
                await blocked(2);

                await holder.commitTransaction();
                const [rotation, sweep] = await Promise.all([refreshing, endingAll]);
                expect(sweep.status).toBe(200);
                refreshed = rotation;
            } finally {
                if (holder.isTransactionActive) await holder.rollbackTransaction();
                await holder.release();
            }

            // Either order is sound — the rotation first and its successor swept, or the sweep first
            // and the rotation refused — but nothing of this account may be left alive.
            const [{ live }] = await dataSource.query<{ live: string }[]>('SELECT COUNT(*) AS live FROM sessions WHERE user_id = $1 AND "revokedAt" IS NULL', [
                userId,
            ]);
            expect(Number(live)).toBe(0);
            if (refreshed.status === 200) await refresh(refreshed.body.refreshToken as string).expect(401);
        });

        it("a parent cannot see another user's sessions", async () => {
            await register('ana');
            const bogdan = await register('bogdan');

            const res = await request(app.getHttpServer()).get('/auth/sessions').set('Authorization', `Bearer ${bogdan.accessToken}`).expect(200);

            expect(res.body).toHaveLength(1);
        });
    });

    it('the token is never stored in the clear', async () => {
        const { refreshToken } = await register();

        const rows = await dataSource.query<{ tokenHash: string }[]>('SELECT "tokenHash" FROM sessions');

        expect(rows).toHaveLength(1);
        expect(rows[0].tokenHash).not.toContain(refreshToken);
        expect(rows[0].tokenHash).toHaveLength(64); // sha256, hex
    });
});
