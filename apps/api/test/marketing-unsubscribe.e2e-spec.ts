import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, registerUser, truncateAll } from './helpers';

/**
 * Refusing marketing from the link in a marketing message — E17 S4.
 *
 * The route is public, so the interesting assertions are the ones about what a stranger holding a
 * link can and cannot do with it: stop a newsletter, and nothing else — not start one, not learn
 * whether a token is real, not reach any other family.
 */
describe('Marketing unsubscribe (e2e)', () => {
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

    /** The token is `select: false`, so it is read straight from the table. */
    const tokenOf = async (username: string): Promise<string> => {
        const rows = await dataSource.query<{ unsubscribeToken: string }[]>(
            `SELECT p."unsubscribeToken" FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.username = $1`,
            [username],
        );
        return rows[0].unsubscribeToken;
    };

    const optInOf = async (username: string): Promise<boolean> => {
        const rows = await dataSource.query<{ marketingOptIn: boolean }[]>(
            `SELECT p."marketingOptIn" FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.username = $1`,
            [username],
        );
        return rows[0].marketingOptIn;
    };

    const optIn = (username: string) =>
        dataSource.query(`UPDATE profiles SET "marketingOptIn" = true WHERE user_id = (SELECT id FROM users WHERE username = $1)`, [username]);

    it('gives every registered family a token, distinct from every other', async () => {
        await registerUser(app, 'ana');
        await registerUser(app, 'bogdan');

        const [ana, bogdan] = [await tokenOf('ana'), await tokenOf('bogdan')];

        expect(ana).toHaveLength(43); // 32 random bytes, base64url
        expect(ana).not.toBe(bogdan);
    });

    it('stops marketing for the family the token names', async () => {
        await registerUser(app, 'ana');
        await optIn('ana');

        await request(app.getHttpServer())
            .post('/marketing/unsubscribe')
            .send({ token: await tokenOf('ana') })
            .expect(200);

        expect(await optInOf('ana')).toBe(false);
    });

    it('needs no account — that is the whole point', async () => {
        await registerUser(app, 'ana');
        await optIn('ana');

        // No Authorization header. Legea 506/2004 art. 12 asks that refusing be possible from the
        // message, and a parent reading it on a phone is not signed in.
        const res = await request(app.getHttpServer())
            .post('/marketing/unsubscribe')
            .send({ token: await tokenOf('ana') });

        expect(res.status).toBe(200);
    });

    it('answers a made-up token exactly as it answers a real one', async () => {
        await registerUser(app, 'ana');
        await optIn('ana');

        const real = await request(app.getHttpServer())
            .post('/marketing/unsubscribe')
            .send({ token: await tokenOf('ana') });
        const invented = await request(app.getHttpServer()).post('/marketing/unsubscribe').send({ token: 'nu-exista-jetonul-asta' });

        // Any difference — status or body — is a way to hunt for tokens that exist.
        expect(invented.status).toBe(real.status);
        expect(invented.body).toEqual(real.body);
    });

    it('touches nobody else', async () => {
        await registerUser(app, 'ana');
        await registerUser(app, 'bogdan');
        await optIn('ana');
        await optIn('bogdan');

        await request(app.getHttpServer())
            .post('/marketing/unsubscribe')
            .send({ token: await tokenOf('ana') })
            .expect(200);

        expect(await optInOf('bogdan')).toBe(true);
    });

    it('only ever turns it off — a second call cannot turn it back on', async () => {
        await registerUser(app, 'ana');
        await optIn('ana');
        const token = await tokenOf('ana');

        await request(app.getHttpServer()).post('/marketing/unsubscribe').send({ token }).expect(200);
        await request(app.getHttpServer()).post('/marketing/unsubscribe').send({ token }).expect(200);

        // A link that could switch consent on would be a way to sign a family up for marketing.
        expect(await optInOf('ana')).toBe(false);
    });

    it('refuses a body with no token at all', async () => {
        await request(app.getHttpServer()).post('/marketing/unsubscribe').send({}).expect(400);
    });

    it('does not accept an id in place of the token', async () => {
        await registerUser(app, 'ana');
        await optIn('ana');

        // `forbidNonWhitelisted`: the DTO declares `token` and nothing else, so there is no field
        // through which a caller could name a family by number.
        await request(app.getHttpServer()).post('/marketing/unsubscribe').send({ token: 'x', profileId: 1 }).expect(400);

        expect(await optInOf('ana')).toBe(true);
    });

    it('leaves the trail, without the value', async () => {
        await registerUser(app, 'ana');
        await optIn('ana');

        await request(app.getHttpServer())
            .post('/marketing/unsubscribe')
            .send({ token: await tokenOf('ana') })
            .expect(200);

        const rows = await dataSource.query<{ changes: Record<string, unknown>; actor_user_id: number | null; note: string }[]>(
            `SELECT changes, actor_user_id, note FROM audit_log WHERE entity_type = 'Profile' ORDER BY id DESC LIMIT 1`,
        );
        expect(rows[0].changes).toEqual({ marketingOptIn: { from: null, to: null } });
        expect(rows[0].actor_user_id).toBeNull();
        expect(rows[0].note).toContain('dezabonare');
    });
});
